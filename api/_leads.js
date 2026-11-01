// Leads are their own module, separate from customers and orders.
// A lead only becomes a customer when an agent converts it.
//
// Where leads come from:
//  - today: the website form (api/lead.js) writes into the leads table.
//  - later: an external leads system. Set LEADS_API_URL (and LEADS_API_KEY if it needs one)
//    and sync() pulls new leads into the same table. Adjust fromProvider() to that system's fields.
const { query } = require("./_db");

const STATUSES = ["new", "converted", "rejected"];
const SYNC_EVERY_MS = 60 * 1000;
let lastSync = 0;

const str = (v, max) => (v == null ? "" : String(v).trim().slice(0, max));

// Saves one lead; a lead seen before (same source + external id) is skipped.
async function addLead(l) {
  const rows = await query(`INSERT INTO leads (source, external_id, name, phone, email, address, service, message, received_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now()))
    ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
    [str(l.source || "website", 40), l.external_id ? str(l.external_id, 120) : null, str(l.name, 120), str(l.phone, 40),
      str(l.email, 200), str(l.address, 200), str(l.service, 120), str(l.message, 3000), l.received_at || null]);
  return rows[0]?.id || null;
}

// One lead from the external system → our fields. Change this to match that system's API.
function fromProvider(x) {
  return {
    source: "leads-api",
    external_id: x.id,
    name: x.name || x.full_name,
    phone: x.phone,
    email: x.email,
    address: x.address || x.city,
    service: x.service || x.interest,
    message: x.message || x.notes,
    received_at: x.created_at,
  };
}

// Pulls new leads from the external system, at most once a minute. Does nothing until LEADS_API_URL is set.
async function sync() {
  const url = process.env.LEADS_API_URL;
  if (!url || Date.now() - lastSync < SYNC_EVERY_MS) return 0;
  lastSync = Date.now();
  try {
    const r = await fetch(url, { headers: process.env.LEADS_API_KEY ? { Authorization: `Bearer ${process.env.LEADS_API_KEY}` } : {} });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = Array.isArray(data) ? data : data.leads || data.data || [];
    let added = 0;
    for (const x of list) if (x && x.id != null && (await addLead(fromProvider(x)))) added++;
    return added;
  } catch (e) {
    console.error("leads sync failed:", e.message); // never block the studio on the leads system
    return 0;
  }
}

module.exports = { STATUSES, addLead, sync };
