// Private chimney visualizer backend (used only by /studio).
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   STUDIO_PASSWORD  - the shared password, only used when api/_auth.js OPEN_ACCESS is false
//   GEMINI_API_KEY   - Google AI Studio key (required)
//   GEMINI_MODEL     - optional, defaults to Nano Banana Pro
const sharp = require("sharp");
const { allowed } = require("./_auth");

const MODEL = process.env.GEMINI_MODEL || "gemini-3-pro-image";
const ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

const lines = (arr) => arr.filter((l) => l !== "" && l != null).join("\n");

const REALISM = [
  "PHOTOREALISM - it must look like a real photo taken after a real installation, never like a pasted cut-out:",
  "- RE-RENDER the chimney inside this scene. Do NOT copy-paste pixels from the reference photos: ignore their background, lighting, white balance, camera angle and sharpness - they only define the product's design.",
  "- Draw it from THIS photo's camera viewpoint: same perspective and vanishing lines, correct foreshortening, vertical edges parallel to the house's vertical edges.",
  "- It must physically come out of the roof: its base follows the roof slope, with flashing/collar where it meets the roof. If it stands behind the ridge, the ridge hides its lower part.",
  "- Same light as the house: the sunlit faces and shaded faces of the chimney must match how the house walls and roof are lit; cast a shadow on the roof in the same direction and softness as the other shadows in the photo.",
  "- Same photographic quality as the surroundings: same sharpness/softness as the roof edges next to it, same haze, contrast, color temperature, noise/grain and JPEG compression. Edges against the sky must be as soft as the roof line, not cut-out sharp.",
  "- Realistic size for a house of this scale (use doors, windows and roof tiles as a ruler).",
];

function buildPrompt({ mode, chimneyName, chimneyDescription, notes, refCount, hasContext }) {
  const task = mode === "replace"
    ? "The red-marked area contains an existing old chimney (or chimney remains). Remove the old chimney completely - including its cap, flashing and stains - rebuild the roof surface underneath naturally, and build the new chimney from the reference photos in that place."
    : "Build the new chimney from the reference photos on the roof, standing in the red-marked area. The house has no chimney there now.";
  const first = hasContext ? 4 : 3;

  return lines([
    "You are a professional architectural photo retoucher. Edit a real photograph of a customer's house.",
    "",
    "INPUTS:",
    "- IMAGE 1: a zoomed-in part of the house photo. THIS is the image you edit and return, with exactly the same framing.",
    "- IMAGE 2: the same as IMAGE 1 with the work area marked in red. Use it ONLY to know where to work. Never draw red in the result.",
    hasContext ? "- IMAGE 3: the full house photo, for context only (overall lighting, sun direction, scale). Do not return it." : "",
    `- IMAGES ${first} to ${first + refCount - 1}: product photos of the exact chimney to install${chimneyName ? ` ("${chimneyName}")` : ""}.`,
    "",
    "TASK:",
    task,
    "",
    "PRODUCT FIDELITY:",
    "- The chimney must be the same product as in the product photos: same shape, proportions, materials, texture, color, cap/cowl and trims. Do not invent a different design.",
    chimneyDescription ? `- Product details: ${chimneyDescription}` : "",
    "",
    ...REALISM,
    "",
    "KEEP EVERYTHING ELSE IDENTICAL: outside the chimney, its shadow and its roof junction, do not change anything - same framing, colors, roof, sky and trees. No text, borders or watermarks.",
    notes ? `\nEXTRA INSTRUCTIONS FROM THE INSTALLER: ${notes}` : "",
  ]);
}

function buildRefinePrompt({ chimneyDescription, refCount }) {
  return lines([
    "IMAGE 1 is a photo of a house where a chimney was digitally added. It still looks a bit artificial / pasted on.",
    `IMAGES 2 to ${1 + refCount} show the real product, for design reference only.`,
    "",
    "Make IMAGE 1 indistinguishable from a real, untouched photograph, as if the chimney was really built there and then photographed.",
    "Fix only the chimney area: integration with the roof, lighting and shading, cast and contact shadows, flashing at the base, edge softness, color grading, sharpness, noise and compression so they match the rest of the photo exactly.",
    "Keep the chimney's design, position, size and proportions. Keep everything else in the photo exactly as it is - same framing, no re-styling.",
    chimneyDescription ? `Product details: ${chimneyDescription}` : "",
    "",
    ...REALISM,
  ]);
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

const img = (data) => ({ inlineData: { mimeType: "image/jpeg", data } });

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = req.body || {};

  if (!allowed(body)) return res.status(401).json({ error: "אין הרשאה" });

  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server" });

  const { house, guide, context, refs, aspect, size } = body;
  const refine = body.action === "refine";
  if (!house || (!refine && !guide) || !Array.isArray(refs) || refs.length === 0) {
    return res.status(400).json({ error: "חסרה תמונת בית, סימון או תמונת ארובה" });
  }
  const refList = refs.slice(0, 6);

  const parts = refine
    ? [
        { text: buildRefinePrompt({ ...body, refCount: refList.length }) },
        { text: "IMAGE 1 (photo to fix and return):" }, img(house),
        ...refList.flatMap((d, i) => [{ text: `IMAGE ${2 + i} (product reference only):` }, img(d)]),
      ]
    : [
        { text: buildPrompt({ ...body, refCount: refList.length, hasContext: !!context }) },
        { text: "IMAGE 1 (photo to edit and return):" }, img(house),
        { text: "IMAGE 2 (work area marked in red - location only):" }, img(guide),
        ...(context ? [{ text: "IMAGE 3 (full photo - context only):" }, img(context)] : []),
        ...refList.flatMap((d, i) => [{ text: `IMAGE ${(context ? 4 : 3) + i} (chimney product reference):` }, img(d)]),
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
