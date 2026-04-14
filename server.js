const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        address TEXT,
        dob DATE,
        added_on DATE DEFAULT CURRENT_DATE,
        last_visit DATE,
        visits INTEGER DEFAULT 0,
        total_spent NUMERIC DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        clientName TEXT,
        total NUMERIC,
        payment TEXT DEFAULT 'Cash',
        status TEXT DEFAULT 'Live',
        notes TEXT,
        satisfaction TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id SERIAL PRIMARY KEY,
        bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
        service_name TEXT,
        staff TEXT,
        price NUMERIC,
        discount NUMERIC,
        final_price NUMERIC
      )
    `);

    await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment TEXT DEFAULT 'Cash'`);
    await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Live'`);
    await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS satisfaction TEXT`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_visit DATE`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS visits INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_spent NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS added_on DATE DEFAULT CURRENT_DATE`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS dob DATE`);

    console.log('Tables ready');
  } catch (err) {
    console.error('DB Init Error:', err);
  }
}

initDB();

app.get('/', (req, res) => {
  res.send('Backend is running');
});

app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        phone,
        email,
        address,
        dob,
        added_on,
        last_visit,
        visits,
        total_spent
      FROM clients
      ORDER BY name ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('GET CLIENTS ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const name = cleanText(req.body.name);
    const phone = cleanText(req.body.phone);

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const result = await pool.query(
      `
        INSERT INTO clients (name, phone, email, address, dob, added_on)
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
        ON CONFLICT (phone) DO UPDATE SET
          name = EXCLUDED.name,
          email = COALESCE(EXCLUDED.email, clients.email),
          address = COALESCE(EXCLUDED.address, clients.address),
          dob = COALESCE(EXCLUDED.dob, clients.dob)
        RETURNING *
      `,
      [
        name,
        phone,
        cleanText(req.body.email),
        cleanText(req.body.address),
        cleanText(req.body.dob)
      ]
    );

    res.json({ success: true, client: result.rows[0] });
  } catch (err) {
    console.error('UPSERT CLIENT ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      client_id,
      clientName,
      clientPhone,
      clientEmail,
      clientAddress,
      clientDob,
      payment,
      notes,
      items = [],
      total
    } = req.body;

    const totalValue = Number(total) || 0;
    const paymentValue = cleanText(payment) || 'Cash';
    const notesValue = cleanText(notes);
    const safeItems = Array.isArray(items) ? items : [];

    await client.query('BEGIN');

    let resolvedClientId = client_id || null;
    let resolvedClientName = cleanText(clientName) || 'Walk-in Customer';
    const phoneValue = cleanText(clientPhone);

    if (phoneValue) {
      const upsertResult = await client.query(
        `
          INSERT INTO clients (
            name,
            phone,
            email,
            address,
            dob,
            added_on,
            last_visit,
            visits,
            total_spent
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE, 1, $6)
          ON CONFLICT (phone) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, clients.name),
            email = COALESCE(EXCLUDED.email, clients.email),
            address = COALESCE(EXCLUDED.address, clients.address),
            dob = COALESCE(EXCLUDED.dob, clients.dob),
            last_visit = CURRENT_DATE,
            visits = COALESCE(clients.visits, 0) + 1,
            total_spent = COALESCE(clients.total_spent, 0) + EXCLUDED.total_spent
          RETURNING id, name
        `,
        [
          resolvedClientName,
          phoneValue,
          cleanText(clientEmail),
          cleanText(clientAddress),
          cleanText(clientDob),
          totalValue
        ]
      );

      resolvedClientId = upsertResult.rows[0].id;
      resolvedClientName = upsertResult.rows[0].name;
    } else if (resolvedClientId) {
      await client.query(
        `
          UPDATE clients
          SET
            last_visit = CURRENT_DATE,
            visits = COALESCE(visits, 0) + 1,
            total_spent = COALESCE(total_spent, 0) + $2
          WHERE id = $1
        `,
        [resolvedClientId, totalValue]
      );

      const existingClient = await client.query(
        `SELECT name FROM clients WHERE id = $1`,
        [resolvedClientId]
      );

      if (existingClient.rowCount > 0) {
        resolvedClientName = existingClient.rows[0].name;
      }
    }

    const billResult = await client.query(
      `
        INSERT INTO bills (client_id, clientName, total, payment, status, notes, date)
        VALUES ($1, $2, $3, $4, 'Live', $5, NOW())
        RETURNING id
      `,
      [resolvedClientId, resolvedClientName, totalValue, paymentValue, notesValue]
    );

    const billId = billResult.rows[0].id;

    for (const item of safeItems) {
      await client.query(
        `
          INSERT INTO bill_items (bill_id, service_name, staff, price, discount, final_price)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          billId,
          cleanText(item.service_name),
          cleanText(item.staff),
          Number(item.price) || 0,
          Number(item.discount) || 0,
          Number(item.final_price) || 0
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      billId,
      clientId: resolvedClientId,
      clientName: resolvedClientName
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST BILL ERROR:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.patch('/api/bills/:id/satisfaction', async (req, res) => {
  try {
    const billId = Number(req.params.id);
    const satisfaction = cleanText(req.body.satisfaction);

    if (!billId || !satisfaction) {
      return res.status(400).json({ error: 'Bill id and satisfaction are required' });
    }

    await pool.query(
      `UPDATE bills SET satisfaction = $2 WHERE id = $1`,
      [billId, satisfaction]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('PATCH SATISFACTION ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id,
        b.clientName,
        b.total,
        b.date,
        b.client_id,
        b.payment,
        b.status,
        b.notes,
        b.satisfaction,
        c.phone AS client_phone,
        COALESCE(STRING_AGG(bi.service_name, ', '), '') AS services,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'service_name', bi.service_name,
              'staff', bi.staff,
              'price', bi.price,
              'discount', bi.discount,
              'final_price', bi.final_price
            )
          ) FILTER (WHERE bi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM bills b
      LEFT JOIN bill_items bi ON b.id = bi.bill_id
      LEFT JOIN clients c ON b.client_id = c.id
      GROUP BY b.id, c.phone
      ORDER BY b.date DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('GET BILLS ERROR:', err.message);
    res.status(500).json({
      error: err.message || 'No message',
      stack: err.stack || 'No stack'
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
