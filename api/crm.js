// Sales agents' CRM for /studio: customers, leads, call-backs and orders.
// POST { password, agent, action, ...args } → JSON.
const { passwordOk } = require("./_auth");
const { query, ensureSchema } = require("./_db");

const CUSTOMER_STATUS = ["new", "follow_up", "customer", "closed"];
const ORDER_STATUS = ["new", "confirmed", "scheduled", "done", "cancelled"];
const CUSTOMER_FIELDS = ["name", "phone", "email", "address", "service", "source", "notes"];
const ORDER_FIELDS = ["service", "product", "notes"];

class BadRequest extends Error {}

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest("מזהה לא תקין");
  return n;
};
const dateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) throw new BadRequest("תאריך לא תקין");
  return d.toISOString();
};

async function log(customerId, text, agent) {
  await query("INSERT INTO activity (customer_id, text, agent) VALUES ($1, $2, $3)", [customerId, text, agent]);
}

const actions = {
  async stats() {
    const [r] = await query(`SELECT
      (SELECT count(*) FROM customers WHERE status = 'new')::int AS leads,
      (SELECT count(*) FROM customers WHERE status = 'follow_up')::int AS callbacks,
      (SELECT count(*) FROM customers WHERE status = 'follow_up' AND follow_up_at < date_trunc('day', now()) + interval '1 day')::int AS callbacks_due,
      (SELECT count(*) FROM orders WHERE status IN ('new', 'confirmed', 'scheduled'))::int AS open_orders`);
    return r;
  },

  async list({ filter, q }) {
    const where = [], params = [];
    if (filter === "leads") where.push("status = 'new'");
    else if (filter === "callbacks") where.push("status = 'follow_up'");
    const search = str(q, 80);
    if (search) {
      params.push(`%${search}%`);
      where.push(`(name ILIKE $1 OR phone ILIKE $1 OR address ILIKE $1)`);
    }
    const order = filter === "callbacks" ? "follow_up_at ASC NULLS LAST" : "created_at DESC";
    return query(`SELECT id, name, phone, address, service, source, status, follow_up_at, created_at
      FROM customers ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT 200`, params);
  },

  async get({ id: raw }) {
    const cid = id(raw);
    const [customer] = await query("SELECT * FROM customers WHERE id = $1", [cid]);
    if (!customer) throw new BadRequest("הלקוח לא נמצא");
    // install_date as plain text, so no time zone can move it a day
    const orders = await query(`SELECT id, customer_id, service, product, price, install_date::text AS install_date, status, notes, agent, created_at
      FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`, [cid]);
    const activity = await query("SELECT * FROM activity WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100", [cid]);
    return { customer, orders, activity };
  },

  async saveCustomer({ customer = {} }, agent) {
    const c = Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f, str(customer[f], f === "notes" ? 4000 : 300)]));
    if (!c.name) throw new BadRequest("חסר שם לקוח");
    if (!c.phone) throw new BadRequest("חסר טלפון");
    if (customer.id) {
      const cid = id(customer.id);
      const rows = await query(`UPDATE customers SET name=$1, phone=$2, email=$3, address=$4, service=$5, source=$6, notes=$7, updated_at=now()
        WHERE id=$8 RETURNING id`, [...CUSTOMER_FIELDS.map((f) => c[f]), cid]);
      if (!rows.length) throw new BadRequest("הלקוח לא נמצא");
      await log(cid, "פרטי הלקוח עודכנו", agent);
      return { id: cid };
    }
    const [row] = await query(`INSERT INTO customers (name, phone, email, address, service, source, notes, status, agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'new',$8) RETURNING id`, [...CUSTOMER_FIELDS.map((f) => c[f]), agent]);
    await log(row.id, "לקוח חדש נפתח", agent);
    return { id: row.id };
  },

  async setStatus({ id: raw, status, follow_up_at, note }, agent) {
    const cid = id(raw);
    if (!CUSTOMER_STATUS.includes(status)) throw new BadRequest("סטטוס לא תקין");
    const when = status === "follow_up" ? dateOrNull(follow_up_at) : null;
    if (status === "follow_up" && !when) throw new BadRequest("צריך לבחור מתי לחזור ללקוח");
    const rows = await query("UPDATE customers SET status=$1, follow_up_at=$2, updated_at=now() WHERE id=$3 RETURNING id", [status, when, cid]);
    if (!rows.length) throw new BadRequest("הלקוח לא נמצא");
    const label = { new: "הוחזר ללידים", follow_up: "לחזור ללקוח", customer: "סומן כלקוח", closed: "סומן כלא רלוונטי" }[status];
    const text = str(note, 1000);
    await log(cid, text ? `${label} – ${text}` : label, agent);
    return { ok: true };
  },

  async addNote({ id: raw, text }, agent) {
    const t = str(text, 2000);
    if (!t) throw new BadRequest("ההערה ריקה");
    await log(id(raw), t, agent);
    return { ok: true };
  },

  async saveOrder({ order = {} }, agent) {
    const cid = id(order.customer_id);
    const o = Object.fromEntries(ORDER_FIELDS.map((f) => [f, str(order[f], f === "notes" ? 4000 : 300)]));
    const status = ORDER_STATUS.includes(order.status) ? order.status : "new";
    const price = order.price === "" || order.price == null ? null : Number(order.price);
    if (price !== null && (!isFinite(price) || price < 0)) throw new BadRequest("מחיר לא תקין");
    const install = order.install_date ? String(order.install_date).slice(0, 10) : null;
    if (install && !/^\d{4}-\d{2}-\d{2}$/.test(install)) throw new BadRequest("תאריך התקנה לא תקין");
    if (!o.service && !o.product) throw new BadRequest("חסר שירות או מוצר");

    if (order.id) {
      const oid = id(order.id);
      const rows = await query(`UPDATE orders SET service=$1, product=$2, notes=$3, status=$4, price=$5, install_date=$6
        WHERE id=$7 AND customer_id=$8 RETURNING id`, [o.service, o.product, o.notes, status, price, install, oid, cid]);
      if (!rows.length) throw new BadRequest("ההזמנה לא נמצאה");
      await log(cid, `הזמנה #${oid} עודכנה`, agent);
      return { id: oid };
    }
    const [row] = await query(`INSERT INTO orders (customer_id, service, product, notes, status, price, install_date, agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [cid, o.service, o.product, o.notes, status, price, install, agent]);
    // An order makes the lead a customer.
    await query("UPDATE customers SET status='customer', follow_up_at=NULL, updated_at=now() WHERE id=$1 AND status IN ('new','follow_up')", [cid]);
    await log(cid, `נפתחה הזמנה #${row.id}`, agent);
    return { id: row.id };
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = req.body || {};
  if (!process.env.STUDIO_PASSWORD) return res.status(500).json({ error: "STUDIO_PASSWORD is not set on the server" });
  if (!passwordOk(body.password)) return res.status(401).json({ error: "סיסמה שגויה" });

  const fn = actions[body.action];
  if (!fn) return res.status(400).json({ error: "פעולה לא מוכרת" });
  try {
    await ensureSchema();
    res.json(await fn(body, str(body.agent, 80)));
  } catch (e) {
    if (e instanceof BadRequest) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: `שגיאת שרת: ${e.message}` });
  }
};
