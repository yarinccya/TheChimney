// Who is calling the studio API.
//
// OPEN_ACCESS = true: there is no login yet. Every request acts as the default employee
// (the first row of the employees table), so the dashboard opens as if already signed in.
// WARNING: while open, anyone who reaches /studio sees the real customers and orders.
//
// When the manager site and personal logins arrive: set OPEN_ACCESS = false and make
// currentEmployee() read the employee from a session cookie instead.
const crypto = require("crypto");
const { query, ensureSchema } = require("./_db");

const OPEN_ACCESS = true;

// Legacy shared password (STUDIO_PASSWORD), used only when OPEN_ACCESS is false.
function passwordOk(given) {
  const real = process.env.STUDIO_PASSWORD;
  if (!real || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// Can this request use the studio at all?
const allowed = (body = {}) => OPEN_ACCESS || passwordOk(body.password);

const PUBLIC_FIELDS = "id, username, name, role, phone, email, created_at";

// The signed-in employee. For now: the default employee, created on first use.
async function currentEmployee() {
  await ensureSchema();
  const [me] = await query(`SELECT ${PUBLIC_FIELDS} FROM employees WHERE active ORDER BY id LIMIT 1`);
  if (me) return me;
  const [created] = await query(`INSERT INTO employees (username, name, role) VALUES ('agent', '', 'סוכן מכירות')
    ON CONFLICT (username) DO UPDATE SET active = true RETURNING ${PUBLIC_FIELDS}`);
  return created;
}

module.exports = { OPEN_ACCESS, allowed, passwordOk, currentEmployee, PUBLIC_FIELDS };
