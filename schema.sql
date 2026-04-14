create table if not exists public.clients (
  id bigserial primary key,
  name text not null,
  phone text not null unique,
  email text,
  address text,
  dob date,
  added_on date default current_date,
  last_visit date,
  visits integer default 0,
  total_spent numeric default 0
);

create table if not exists public.bills (
  id bigserial primary key,
  client_id bigint references public.clients(id) on delete set null,
  clientname text,
  total numeric,
  payment text default 'Cash',
  status text default 'Live',
  notes text,
  satisfaction text,
  date timestamp default current_timestamp
);

create table if not exists public.bill_items (
  id bigserial primary key,
  bill_id bigint not null references public.bills(id) on delete cascade,
  service_name text,
  staff text,
  price numeric,
  discount numeric,
  final_price numeric
);

create index if not exists idx_clients_phone on public.clients(phone);
create index if not exists idx_clients_last_visit on public.clients(last_visit);
create index if not exists idx_bills_date on public.bills(date);
create index if not exists idx_bill_items_bill_id on public.bill_items(bill_id);
