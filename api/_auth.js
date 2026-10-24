// Shared login check for the private /studio API.
// Today: one shared password (STUDIO_PASSWORD). Personal logins can replace this function later.
const crypto = require("crypto");

function passwordOk(given) {
  const real = process.env.STUDIO_PASSWORD;
  if (!real || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { passwordOk };
