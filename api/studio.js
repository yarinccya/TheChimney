// Private chimney visualizer backend (used only by /studio).
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   STUDIO_PASSWORD  - the password for /studio (required)
//   GEMINI_API_KEY   - Google AI Studio key (required)
//   GEMINI_MODEL     - optional, defaults to Nano Banana Pro
const crypto = require("crypto");
const sharp = require("sharp");

const MODEL = process.env.GEMINI_MODEL || "gemini-3-pro-image";
const ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

function passwordOk(given) {
  const real = process.env.STUDIO_PASSWORD;
  if (!real || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

function buildPrompt({ mode, chimneyName, chimneyDescription, notes, refCount }) {
  const task = mode === "replace"
    ? "The highlighted area contains an existing old chimney (or chimney remains). Remove the old chimney completely - including its cap, flashing and any stains it leaves - restore the roof surface underneath it naturally, and install the new chimney from the reference photos in that place."
    : "Install the new chimney from the reference photos on the roof, standing inside the highlighted area. The house currently has no chimney there.";

  return [
    "You are a professional architectural photo retoucher. Edit a real photograph of a customer's house so it looks like an untouched photo taken after a real installation.",
    "",
    "INPUTS:",
    "- IMAGE 1: the original photo of the customer's house. This is the photo to edit.",
    "- IMAGE 2: the same photo with the work area painted in semi-transparent red. Use it ONLY to know where to work. Never draw any red paint in the result.",
    `- IMAGES 3 to ${2 + refCount}: reference photos of the exact chimney product to install${chimneyName ? ` ("${chimneyName}")` : ""}.`,
    "",
    "TASK:",
    task,
    "",
    "PRODUCT FIDELITY (most important):",
    "- The installed chimney must be the exact same product as in the reference photos: same shape, proportions, materials, texture, color, cap/cowl design, trims and details. Do not invent a different design or simplify it.",
    "- Scale it realistically relative to the house (doors, windows and roof tiles give the scale). It must rise from the roof surface in the highlighted area.",
    chimneyDescription ? `- Product details: ${chimneyDescription}` : "",
    "",
    "PHOTOREALISM:",
    "- Match the camera perspective, vanishing lines and the roof pitch exactly; the chimney must sit plumb (vertical) on the roof with correct foreshortening.",
    "- Match the scene lighting: sun direction, shadow direction and softness, ambient light, color temperature, exposure and reflections. Cast a correct shadow onto the roof and receive shadows where needed.",
    "- Add a realistic roof junction (flashing / collar where it meets the roof) consistent with the roofing material.",
    "- Match the photo's sharpness, depth of field, noise/grain and compression so the chimney does not look pasted on.",
    "",
    "KEEP EVERYTHING ELSE IDENTICAL:",
    "- Outside the work area, the image must stay pixel-for-pixel the same: same framing, crop, zoom, house, sky, trees, people, cars and colors. Do not re-style, re-color, sharpen or 'improve' the photo.",
    "- Output a single photo with the same framing as IMAGE 1. No text, labels, borders or watermarks.",
    notes ? `\nEXTRA INSTRUCTIONS FROM THE INSTALLER: ${notes}` : "",
  ].filter((l) => l !== "").join("\n");
}

function findImage(node) {
  if (!node || typeof node !== "object") return null;
  const inline = node.inlineData || node.inline_data;
  if (inline && inline.data) return inline.data;
  for (const k of Object.keys(node)) {
    const found = findImage(node[k]);
    if (found) return found;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = req.body || {};

  if (!process.env.STUDIO_PASSWORD) return res.status(500).json({ error: "STUDIO_PASSWORD is not set on the server" });
  if (!passwordOk(body.password)) return res.status(401).json({ error: "סיסמה שגויה" });
  if (body.action === "login") return res.json({ ok: true });

  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server" });

  const { house, guide, refs, aspect, size } = body;
  if (!house || !guide || !Array.isArray(refs) || refs.length === 0) {
    return res.status(400).json({ error: "חסרה תמונת בית, סימון או תמונת ארובה" });
  }

  const parts = [
    { text: buildPrompt({ ...body, refCount: refs.length }) },
    { text: "IMAGE 1 (original house photo):" },
    { inlineData: { mimeType: "image/jpeg", data: house } },
    { text: "IMAGE 2 (work area highlighted in red - for location only):" },
    { inlineData: { mimeType: "image/jpeg", data: guide } },
    ...refs.slice(0, 6).flatMap((data, i) => [
      { text: `IMAGE ${3 + i} (chimney product reference):` },
      { inlineData: { mimeType: "image/jpeg", data } },
    ]),
  ];

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: ASPECTS.includes(aspect) ? aspect : "4:3",
        imageSize: ["1K", "2K", "4K"].includes(size) ? size : "2K",
      },
    },
  };

  let data;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(payload),
    });
    data = await r.json();
    if (!r.ok) return res.status(502).json({ error: `Gemini (${MODEL}): ${data.error?.message || r.status}` });
  } catch (e) {
    return res.status(502).json({ error: `Gemini request failed: ${e.message}` });
  }

  const b64 = findImage(data);
  if (!b64) {
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join(" ");
    const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || "";
    return res.status(502).json({ error: `המודל לא החזיר תמונה ${reason}. ${text}`.trim() });
  }

  // Re-encode as high quality JPEG so the response stays under Vercel's 4.5MB limit.
  const jpeg = await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  res.json({ image: jpeg.toString("base64") });
};
