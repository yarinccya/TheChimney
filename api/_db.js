// Postgres access for the studio (Neon, connected through the Vercel Marketplace).
// The Neon integration sets DATABASE_URL; tables are created on first use.
let runQuery = null;
let ready = null;

function query(text, params = []) {
  if (!runQuery) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set on the server (connect Neon in Vercel → Storage)");
    const { neon } = require("@neondatabase/serverless");
    const sql = neon(url);
    runQuery = (t, p) => sql.query(t, p);
  }
  return runQuery(text, params);
}

// Lets the local dev server plug in an in-process Postgres instead of Neon.
function useQuery(fn) {
  runQuery = fn;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    follow_up_at TIMESTAMPTZ,
    notes TEXT NOT NULL DEFAULT '',
    agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS customers_status ON customers (status, follow_up_at)`,
  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    service TEXT NOT NULL DEFAULT '',
    product TEXT NOT NULL DEFAULT '',
    price NUMERIC(12,2),
    install_date DATE,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT NOT NULL DEFAULT '',
    agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS orders_customer ON orders (customer_id)`,
  `CREATE TABLE IF NOT EXISTS activity (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS activity_customer ON activity (customer_id, created_at)`,
];

function ensureSchema() {
  if (!ready) {
    ready = (async () => { for (const s of SCHEMA) await query(s); })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

module.exports = { query, useQuery, ensureSchema };
