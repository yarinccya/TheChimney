// Public endpoint for the website's lead form (lead.html). Saves the lead as a new
// customer with status "new", so it shows up under "pending leads" in /studio.
const { query, ensureSchema } = require("./_db");

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const b = req.body || {};
  if (str(b.website, 200)) return res.json({ ok: true }); // honeypot field: bots fill it, people don't see it

  const name = str(b.name, 120), phone = str(b.phone, 40);
  if (!name || phone.replace(/\D/g, "").length < 7) return res.status(400).json({ error: "Name and phone are required" });

  try {
    await ensureSchema();
    const [row] = await query(`INSERT INTO customers (name, phone, email, address, service, source, notes, status)
      VALUES ($1,$2,$3,$4,$5,'website',$6,'new') RETURNING id`,
      [name, phone, str(b.email, 200), str(b.location, 200), str(b.serviceLabel || b.service, 120), str(b.message, 3000)]);
    await query("INSERT INTO activity (customer_id, text) VALUES ($1, $2)", [row.id, "ליד חדש מהאתר"]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save" });
  }
};
