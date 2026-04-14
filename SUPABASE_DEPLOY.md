**Supabase Setup**

1. Create a new Supabase project.
2. Open the SQL editor and run the SQL from [schema.sql](C:\Users\Admin\OneDrive\Documents\New project\salonapp_supabase\supabase\schema.sql).

3. Copy the project connection string into `backend/.env` using [backend/.env.example](C:\Users\Admin\OneDrive\Documents\New project\salonapp_supabase\backend\.env.example) as the template.
4. Run `npm install` inside `backend`.
5. Run `npm start` inside `backend`.

**Frontend Hosting**

Supabase is a good fit for the Postgres database, but I recommend hosting the UI as a static site on Vercel, Netlify, or Cloudflare Pages. Your `index.html` can keep calling the backend API URL after you deploy the backend separately.

**Current Tables**

- `clients`: stores phone, last visit, visits, and spend history
- `bills`: stores each bill plus payment, notes, and satisfaction
- `bill_items`: stores line items and staff attribution

**Next Recommended Step**

Move the hardcoded `BASE_URL` in `index.html` to a small config script or environment-driven replacement during deploy.
