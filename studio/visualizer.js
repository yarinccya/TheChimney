// Before/after chimney visualizer (the #/visual screen of the studio portal).
(() => {
  const { $, sizeTo } = Studio;
  const api = (body) => Studio.api("/api/studio", body);
  const HOUSE_MAX = 2048;   // long side sent to the model
  const REF_MAX = 1024;
  const VIEW_MAX = 1280;    // editor + mask resolution
  const ASPECTS = [["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3], ["4:5", 4 / 5], ["5:4", 5 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9]];

  let photo = null;          // canvas, ≤ HOUSE_MAX
  let mask = null;           // canvas, view resolution, white = work area
  let history = [];
  let erasing = false;
  let brushSize = 4.5;       // % of the photo width
  let mode = "add";
  let catalogPick = null;
  let uploads = [];          // canvases of uploaded chimney photos

  /* ---------- helpers ---------- */
  const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: Math.round(w), height: Math.round(h) });

  async function loadBitmap(src) {
    if (src instanceof Blob) {
      try { return await createImageBitmap(src, { imageOrientation: "from-image" }); } catch {}
      src = URL.createObjectURL(src);
    }
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  }

  function fit(bitmap, max) {
    const w = bitmap.width, h = bitmap.height, s = Math.min(1, max / Math.max(w, h));
    const c = canvas(w * s, h * s);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return c;
  }

  const toB64 = (c, q = 0.92) => c.toDataURL("image/jpeg", q).split(",")[1];

  function nearestAspect(w, h) {
    const r = Math.log(w / h);
    return ASPECTS.reduce((best, a) => Math.abs(Math.log(a[1]) - r) < Math.abs(Math.log(best[1]) - r) ? a : best)[0];
  }

  /* ---------- steps (one block, one step at a time) ---------- */
  const screen = document.querySelector('[data-view="visual"]');
  function goStep(name) {
    for (const s of screen.querySelectorAll(".step")) s.classList.toggle("on", s.dataset.step === String(name));
  }
  screen.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) goStep(b.dataset.go);
  });

  /* ---------- 1. photo ---------- */
  async function onPhoto(file) {
    if (!file) return;
    const bmp = await loadBitmap(file);
    photo = fit(bmp, HOUSE_MAX);
    const s = Math.min(1, VIEW_MAX / Math.max(photo.width, photo.height));
    mask = canvas(photo.width * s, photo.height * s);
    $("view").width = mask.width;
    $("view").height = mask.height;
    history = [];
    $("undo").disabled = true;
    redraw();
    updateGo();
    goStep(2);
    sizeTo($("stage"), mask.width, mask.height);
  }
  for (const id of ["camInput", "galInput"]) {
    $(id).addEventListener("change", (e) => { onPhoto(e.target.files[0]); e.target.value = ""; });
  }

  /* ---------- 2. mask painting ---------- */
  function redMask(w, h) {
    const c = canvas(w, h), ctx = c.getContext("2d");
    ctx.drawImage(mask, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#ff1a1a";
    ctx.fillRect(0, 0, w, h);
    return c;
  }

  function redraw() {
    const v = $("view"), ctx = v.getContext("2d");
    ctx.drawImage(photo, 0, 0, v.width, v.height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(redMask(v.width, v.height), 0, 0);
    ctx.globalAlpha = 1;
  }

  function maskEmpty() {
    if (!mask) return true;
    const d = mask.getContext("2d").getImageData(0, 0, mask.width, mask.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i]) return false;
    return true;
  }

  let last = null;
  function point(e) {
    const r = $("view").getBoundingClientRect();
    return [(e.clientX - r.left) * mask.width / r.width, (e.clientY - r.top) * mask.height / r.height];
  }
  function stroke(from, to) {
    const ctx = mask.getContext("2d");
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = "#fff";
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = mask.width * brushSize / 100;
    ctx.beginPath();
    ctx.moveTo(...from);
    ctx.lineTo(...to);
    ctx.stroke();
    redraw();
  }

  // Round preview of the brush under the finger / mouse, like in Paint.
  function moveCursor(e) {
    const c = $("cursor"), r = $("view").getBoundingClientRect(), d = r.width * brushSize / 100;
    c.style.display = "block";
    c.style.width = c.style.height = `${d}px`;
    c.style.left = `${e.clientX - r.left}px`;
    c.style.top = `${e.clientY - r.top}px`;
    c.classList.toggle("erase", erasing);
  }

  function pushHistory() {
    history.push(mask.getContext("2d").getImageData(0, 0, mask.width, mask.height));
    if (history.length > 15) history.shift();
    $("undo").disabled = false;
  }

  const view = $("view");
  view.addEventListener("pointerdown", (e) => {
    if (!mask) return;
    view.setPointerCapture(e.pointerId);
    pushHistory();
    last = point(e);
    stroke(last, last);
    moveCursor(e);
  });
  view.addEventListener("pointermove", (e) => {
    moveCursor(e);
    if (!last) return;
    const p = point(e);
    stroke(last, p);
    last = p;
  });
  const end = (e) => {
    if (e.pointerType !== "mouse") $("cursor").style.display = "none";
    if (last) { last = null; updateGo(); }
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);
  view.addEventListener("pointerleave", () => { if (!last) $("cursor").style.display = "none"; });

  function setTool(erase) {
    erasing = erase;
    $("toolBrush").classList.toggle("on", !erase);
    $("toolEraser").classList.toggle("on", erase);
    $("toolBrush").setAttribute("aria-pressed", !erase);
    $("toolEraser").setAttribute("aria-pressed", erase);
  }
  $("toolBrush").addEventListener("click", () => setTool(false));
  $("toolEraser").addEventListener("click", () => setTool(true));

  $("sizes").addEventListener("click", (e) => {
    const b = e.target.closest(".size");
    if (!b) return;
    brushSize = +b.dataset.size;
    for (const x of $("sizes").children) x.classList.toggle("on", x === b);
  });

  const flash = (b) => { b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash"); };
  $("undo").addEventListener("click", () => {
    const prev = history.pop();
    if (prev) { mask.getContext("2d").putImageData(prev, 0, 0); redraw(); updateGo(); flash($("undo")); }
    $("undo").disabled = !history.length;
  });
  $("clear").addEventListener("click", () => {
    if (maskEmpty()) return;
    pushHistory();
    mask.getContext("2d").clearRect(0, 0, mask.width, mask.height);
    redraw();
    updateGo();
    flash($("clear"));
  });

  $("modeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    mode = b.dataset.mode;
    for (const x of $("modeSeg").children) x.classList.toggle("on", x === b);
    $("markHint").innerHTML = mode === "replace"
      ? "צבע באצבע את <b>כל הארובה הישנה</b>, כולל הכובע והבסיס."
      : "צבע באצבע את המקום על הגג שבו תעמוד הארובה.";
  });

  /* ---------- 3. chimney ---------- */
  // catalog paths are relative to /studio/, whether or not the URL has a trailing slash
  const catalog = (window.CHIMNEY_CATALOG || []).map((c) => ({ ...c, images: c.images.map((s) => new URL(s, location.origin + "/studio/").href) }));
  function renderCatalog() {
    const box = $("catalog");
    if (!catalog.length) {
      box.outerHTML = '<p class="empty" id="catalog">הקטלוג עדיין ריק. אפשר להעלות תמונות ארובה למטה, או להוסיף ארובות קבועות לקובץ <code>studio/chimneys/catalog.js</code>.</p>';
      return;
    }
    box.innerHTML = "";
    catalog.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chim" + (catalogPick === i ? " on" : "");
      b.innerHTML = `<img src="${c.images[0]}" alt=""><span></span>`;
      b.querySelector("span").textContent = c.name;
      b.addEventListener("click", () => {
        catalogPick = catalogPick === i ? null : i;
        $("desc").value = catalogPick === null ? "" : (c.description || "");
        renderCatalog();
        updateGo();
      });
      box.appendChild(b);
    });
  }

  function renderUploads() {
    const box = $("refThumbs");
    box.innerHTML = "";
    uploads.forEach((c, i) => {
      const wrap = document.createElement("div");
      wrap.className = "chim";
      wrap.style.width = "3.6rem";
      const img = document.createElement("img");
      img.src = c.toDataURL("image/jpeg", 0.7);
      const x = document.createElement("button");
      x.className = "x"; x.type = "button"; x.textContent = "×";
      x.addEventListener("click", () => { uploads.splice(i, 1); renderUploads(); updateGo(); });
      wrap.append(img, x);
      box.appendChild(wrap);
    });
  }

  $("refInput").addEventListener("change", async (e) => {
    for (const f of e.target.files) {
      if (uploads.length >= 6) break;
      uploads.push(fit(await loadBitmap(f), REF_MAX));
    }
    e.target.value = "";
    renderUploads();
    updateGo();
  });

  async function refImages() {
    const out = [];
    if (catalogPick !== null) {
      for (const src of catalog[catalogPick].images) out.push(fit(await loadBitmap(src), REF_MAX));
    }
    return [...out, ...uploads].slice(0, 6);
  }

  function updateGo() {
    const ready = photo && !maskEmpty() && (catalogPick !== null || uploads.length > 0);
    $("go").disabled = !ready;
    $("go").title = ready ? "" : "צריך לבחור או להעלות תמונת ארובה";
    $("markNext").disabled = maskEmpty();
  }
  $("markNext").addEventListener("click", () => goStep(3));

  /* ---------- generate ---------- */
  const SEND_MAX = 2048;

  // Red overlay + solid outline, so the model sees both the area and the roof under it.
  function guideImage(src, m) {
    const w = src.width, h = src.height;
    const g = canvas(w, h), ctx = g.getContext("2d");
    ctx.drawImage(src, 0, 0);
    const red = canvas(w, h), rctx = red.getContext("2d");
    rctx.drawImage(m, 0, 0, w, h);
    rctx.globalCompositeOperation = "source-in";
    rctx.fillStyle = "#ff0000";
    rctx.fillRect(0, 0, w, h);
    const ring = canvas(w, h), oc = ring.getContext("2d"), t = Math.max(2, w / 300);
    for (const [dx, dy] of [[t, 0], [-t, 0], [0, t], [0, -t], [t, t], [-t, -t], [t, -t], [-t, t]]) oc.drawImage(red, dx, dy);
    oc.globalCompositeOperation = "destination-out";
    oc.drawImage(red, 0, 0);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(red, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(ring, 0, 0);
    return fit(g, 1280);
  }

  function maskBox(m) {
    const d = m.getContext("2d").getImageData(0, 0, m.width, m.height).data;
    let x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (d[(y * m.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Zoom in on the marked roof area: the model gets many more pixels for the chimney,
  // and the crop has an exact supported aspect ratio so nothing is stretched.
  function planCrop(W, H, b) {
    const full = { x: 0, y: 0, w: W, h: H, aspect: nearestAspect(W, H) };
    const min = Math.min(W, H) * 0.4;
    let w = Math.max(b.w * 3, b.h * 1.6, min), h = Math.max(b.h * 2.4, min);
    const [aspect, ratio] = ASPECTS.reduce((best, a) => Math.abs(Math.log(a[1] / (w / h))) < Math.abs(Math.log(best[1] / (w / h))) ? a : best);
    if (w / h < ratio) w = h * ratio; else h = w / ratio;
    if (w > W || h > H) {
      const s = Math.min(W / w, H / h);
      w *= s; h *= s;
      if (w < b.w * 1.4 || h < b.h * 1.6) return full;
    }
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.4; // a bit more room above, the chimney grows upward
    const x = Math.min(Math.max(0, cx - w / 2), W - w), y = Math.min(Math.max(0, cy - h / 2), H - h);
    return { x, y, w, h, aspect };
  }

  // Blend mask from what the model actually changed (chimney + shadow + roof junction),
  // grown from the area you marked. Small global color drift elsewhere is ignored.
  function smartMask(orig, gen, userMask) {
    const W = orig.width, H = orig.height, s = 360 / Math.max(W, H);
    const sw = Math.round(W * s), sh = Math.round(H * s);
    const px = (src, blur) => { const c = canvas(sw, sh), x = c.getContext("2d"); if (blur) x.filter = "blur(1px)"; x.drawImage(src, 0, 0, sw, sh); return x.getImageData(0, 0, sw, sh).data; };
    const a = px(orig, true), b = px(gen, true), m = px(userMask, false);
    const n = sw * sh;

    const off = [0, 0, 0]; let cnt = 0;
    for (let i = 0; i < n; i++) if (!m[i * 4 + 3]) { for (let c = 0; c < 3; c++) off[c] += b[i * 4 + c] - a[i * 4 + c]; cnt++; }
    if (cnt) for (let c = 0; c < 3; c++) off[c] /= cnt;

    const diff = new Uint8Array(n), inMask = new Uint8Array(n);
    let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++) {
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(b[i * 4 + c] - a[i * 4 + c] - off[c]));
      diff[i] = d > 26 ? 1 : 0;
      if (m[i * 4 + 3] > 20) { inMask[i] = 1; const x = i % sw, y = (i / sw) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const lim = { x0: x0 - bw - sw * 0.05, x1: x1 + bw + sw * 0.05, y0: y0 - bh * 2 - sh * 0.1, y1: y1 + bh * 0.6 + sh * 0.03 };

    const keep = new Uint8Array(n), q = [];
    for (let i = 0; i < n; i++) if (inMask[i]) { keep[i] = 1; if (diff[i]) q.push(i); }
    while (q.length) {
      const i = q.pop(), x = i % sw, y = (i / sw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * sw + nx;
        if (nx < 0 || ny < 0 || nx >= sw || ny >= sh || keep[j] || !diff[j]) continue;
        if (nx < lim.x0 || nx > lim.x1 || ny < lim.y0 || ny > lim.y1) continue;
        keep[j] = 1; q.push(j);
      }
    }
    let kept = 0; for (let i = 0; i < n; i++) kept += keep[i];
    if (kept > n * 0.6) keep.set(inMask); // model shifted the whole image - fall back to the marked area

    const small = canvas(sw, sh), sctx = small.getContext("2d"), id = sctx.createImageData(sw, sh);
    for (let i = 0; i < n; i++) if (keep[i]) id.data[i * 4 + 3] = 255;
    sctx.putImageData(id, 0, 0);

    const r = Math.max(W, H) * 0.012;
    const grow = canvas(W, H), gctx = grow.getContext("2d");
    gctx.filter = `blur(${r}px)`;
    gctx.drawImage(small, 0, 0, W, H);
    const gd = gctx.getImageData(0, 0, W, H);
    for (let i = 3; i < gd.data.length; i += 4) gd.data[i] = gd.data[i] > 12 ? 255 : 0;
    gctx.putImageData(gd, 0, 0);
    const soft = canvas(W, H), fctx = soft.getContext("2d");
    fctx.filter = `blur(${r * 0.6}px)`;
    fctx.drawImage(grow, 0, 0);
    return soft;
  }

  // Put the edited crop back into the full original photo.
  function compose(original, crop, gen, m) {
    const out = canvas(original.width, original.height), ctx = out.getContext("2d");
    ctx.drawImage(original, 0, 0);
    const patch = canvas(gen.width, gen.height), pctx = patch.getContext("2d");
    pctx.drawImage(gen, 0, 0);
    pctx.globalCompositeOperation = "destination-in";
    pctx.drawImage(m, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(patch, 0, 0, patch.width, patch.height, crop.x, crop.y, crop.w, crop.h);
    return out;
  }

  function compareWidget(before, after) {
    const box = document.createElement("div");
    box.className = "compare";
    const top = canvas(before.width, before.height);
    top.getContext("2d").drawImage(before, 0, 0);
    top.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    const handle = document.createElement("div");
    handle.className = "handle";
    box.append(after, top, handle);
    box.insertAdjacentHTML("beforeend", '<span class="tag b">לפני</span><span class="tag a">אחרי</span>');
    const set = (p) => { top.style.clipPath = `inset(0 0 0 ${p}%)`; handle.style.left = `calc(${p}% - 1.5px)`; handle.style.transform = "none"; };
    set(50);
    const move = (e) => { const r = box.getBoundingClientRect(); set(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))); };
    let drag = false;
    box.addEventListener("pointerdown", (e) => { drag = true; box.setPointerCapture(e.pointerId); move(e); });
    box.addEventListener("pointermove", (e) => drag && move(e));
    box.addEventListener("pointerup", () => (drag = false));
    box.addEventListener("pointercancel", () => (drag = false));
    return { box, setAfter: (c) => { box.replaceChild(c, box.firstChild); } };
  }

  function fileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `chimney-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.jpg`;
  }

  /* ---------- 5. result ---------- */
  let result = null; // the finished photo (canvas)

  function showResult(original, crop, gen, smart) {
    result = compose(original, crop, gen, smart);
    const cmp = compareWidget(original, result);
    $("resultBox").replaceChildren(cmp.box);
    goStep(5);
    sizeTo(cmp.box, original.width, original.height);
  }

  $("download").addEventListener("click", () => result && result.toBlob((b) => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: fileName() });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/jpeg", 0.95));

  // New customer: clear the photo and marking, keep the chosen chimney.
  $("restart").addEventListener("click", () => {
    photo = mask = result = null;
    history = [];
    $("notes").value = "";
    $("resultBox").replaceChildren();
    goStep(1);
  });

  /* ---------- 4. generate ---------- */
  $("go").addEventListener("click", async () => {
    $("go").disabled = true;
    const original = photo;
    const k = original.width / mask.width;
    const mb = maskBox(mask);
    const crop = planCrop(original.width, original.height, { x: mb.x * k, y: mb.y * k, w: mb.w * k, h: mb.h * k });

    const s = Math.min(SEND_MAX / Math.max(crop.w, crop.h), 3); // small crops get upscaled for the model
    const cw = Math.round(crop.w * s), ch = Math.round(crop.h * s);
    const cropC = canvas(cw, ch), cctx = cropC.getContext("2d");
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(original, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch);
    const maskC = canvas(cw, ch);
    maskC.getContext("2d").drawImage(mask, crop.x / k, crop.y / k, crop.w / k, crop.h / k, 0, 0, cw, ch);
    const zoomed = crop.w < original.width * 0.98;

    $("working").hidden = false;
    $("failed").hidden = true;
    $("stageText").textContent = "שלב 1/2: בונה ארובה…";
    $("timer").textContent = "0";
    goStep(4);
    const started = Date.now();
    const t = setInterval(() => { $("timer").textContent = Math.round((Date.now() - started) / 1000); }, 1000);

    const asCrop = async (b64) => {
      const bmp = await loadBitmap("data:image/jpeg;base64," + b64);
      const c = canvas(cw, ch), x = c.getContext("2d");
      x.imageSmoothingQuality = "high";
      x.drawImage(bmp, 0, 0, cw, ch);
      return c;
    };

    try {
      let refs;
      try { refs = (await refImages()).map((c) => toB64(c, 0.9)); }
      catch { throw new Error("לא הצלחתי לטעון את תמונות הארובה מהקטלוג"); }

      const common = {
        refs,
        aspect: crop.aspect,
        size: "2K",
        chimneyName: catalogPick !== null ? catalog[catalogPick].name : "",
        chimneyDescription: $("desc").value.trim(),
      };
      const first = (await api({
        ...common,
        mode,
        house: toB64(cropC, 0.93),
        guide: toB64(guideImage(cropC, maskC), 0.85),
        context: zoomed ? toB64(fit(original, 1024), 0.85) : undefined,
        notes: $("notes").value.trim(),
      })).image;
      $("stageText").textContent = "שלב 2/2: ליטוש ריאליזם…";
      const image = (await api({ ...common, action: "refine", house: toB64(await asCrop(first), 0.93) })).image;
      const gen = await asCrop(image);
      showResult(original, crop, gen, smartMask(cropC, gen, maskC));
    } catch (err) {
      $("working").hidden = true;
      $("failed").hidden = false;
      $("failText").textContent = `ההדמיה נכשלה: ${err.message}`;
    } finally {
      clearInterval(t);
      updateGo();
    }
  });

  /* ---------- start ---------- */
  renderCatalog();
  Studio.route("visual", "visual", () => { if (!screen.querySelector(".step.on")) goStep(1); });
})();
