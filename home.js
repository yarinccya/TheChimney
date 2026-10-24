// Home page sections below the footage: before/after slider, Google reviews, scroll-in.
// Content comes from before-after/jobs.js and reviews/reviews.js.
(() => {
  const $ = id => document.getElementById(id);
  const NAMES = { install: "New installation", clean: "Chimney cleaning", replace: "Chimney replacement" };
  const G_ICON = $("reviews").querySelector(".g-badge svg").outerHTML;

  /* ---------- before / after ---------- */
  const jobs = window.BEFORE_AFTER || [];
  const stage = $("ba-stage"), beforeImg = $("ba-before"), afterImg = $("ba-after"), handle = $("ba-handle");
  const tagB = stage.querySelector(".ba-tag-b"), tagA = stage.querySelector(".ba-tag-a");
  let pos = 50, touched = false;

  function setPos(p) {
    pos = Math.max(0, Math.min(100, p));
    beforeImg.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;   // before on the left of the handle, after on the right
    handle.style.left = pos + "%";
    handle.setAttribute("aria-valuenow", Math.round(pos));
    tagB.style.opacity = pos < 14 ? 0 : 1;
    tagA.style.opacity = pos > 86 ? 0 : 1;
  }
  function select(i) {
    const j = jobs[i];
    beforeImg.src = j.before; afterImg.src = j.after;
    beforeImg.alt = "Before: " + j.title; afterImg.alt = "After: " + j.title;
    $("ba-sample").hidden = !j.sample;
    [...$("ba-jobs").children].forEach((b, k) => { b.setAttribute("aria-selected", k === i); b.tabIndex = k === i ? 0 : -1; });
    setPos(50);
  }

  if (!jobs.length) $("before-after").hidden = true;
  else {
    $("ba-jobs").replaceChildren(...jobs.map((j, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab");
      const img = document.createElement("img"); img.src = j.after; img.alt = ""; img.loading = "lazy";
      const t = document.createElement("span");
      t.innerHTML = "<b></b><small></small>";
      t.firstChild.textContent = j.title; t.lastChild.textContent = NAMES[j.service] || "";
      b.append(img, t);
      b.addEventListener("click", () => { touched = true; select(i); });
      b.addEventListener("keydown", e => {   // arrow keys move between jobs, like tabs
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        const k = (i + d + jobs.length) % jobs.length;
        select(k); $("ba-jobs").children[k].focus();
      });
      return b;
    }));
    select(0);

    let drag = false;
    const fromEvent = e => { const r = stage.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width * 100); };
    stage.addEventListener("pointerdown", e => { drag = touched = true; stage.setPointerCapture(e.pointerId); fromEvent(e); });
    stage.addEventListener("pointermove", e => { if (drag) fromEvent(e); });
    stage.addEventListener("pointerup", () => { drag = false; });
    stage.addEventListener("pointercancel", () => { drag = false; });
    handle.addEventListener("keydown", e => {
      const p = { ArrowLeft: pos - 5, ArrowRight: pos + 5, Home: 0, End: 100 }[e.key];
      if (p === undefined) return;
      e.preventDefault(); touched = true; setPos(p);
    });

    // The first time the slider scrolls into view, nudge the handle so people see it moves.
    const hint = () => {
      if (touched || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const keys = [[0, 50], [450, 72], [1050, 28], [1500, 50]], t0 = performance.now();
      const step = now => {
        if (touched) return;
        const t = now - t0;
        let k = 1; while (k < keys.length - 1 && t > keys[k][0]) k++;
        const [ta, pa] = keys[k - 1], [tb, pb] = keys[k], u = Math.min(1, (t - ta) / (tb - ta)), e = u * u * (3 - 2 * u);
        setPos(pa + (pb - pa) * e);
        if (t < keys[keys.length - 1][0]) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); setTimeout(hint, 500); } }, { threshold: .6 });
      io.observe(stage);
    }
  }

  /* ---------- Google reviews ---------- */
  const R = window.GOOGLE_REVIEWS || { reviews: [] };
  const reviews = R.reviews || [];
  const COLORS = ["#c8102e", "#0b2545", "#2a5db0", "#1e7a4c", "#b35c00", "#6b3fa0"];
  const stars = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

  if (!reviews.length) $("reviews").hidden = true;
  $("rv-grid").replaceChildren(...reviews.map((r, i) => {
    const card = document.createElement("article");
    card.className = "rv-card reveal";
    card.style.transitionDelay = (i % 4) * 90 + "ms";
    card.innerHTML = `<div class="stars" role="img"></div><p></p>
      <div class="rv-who"><span class="rv-avatar"></span><span><b></b><small></small></span>${G_ICON}</div>`;
    const st = card.querySelector(".stars");
    st.textContent = stars(r.stars); st.setAttribute("aria-label", r.stars + " out of 5 stars");
    card.querySelector("p").textContent = r.text;
    const av = card.querySelector(".rv-avatar");
    av.textContent = (r.name || "?").trim().charAt(0).toUpperCase();
    av.style.background = COLORS[[...(r.name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
    card.querySelector(".rv-who b").textContent = r.name;
    card.querySelector(".rv-who small").textContent = r.when || "";
    if (r.sample) { const s = document.createElement("span"); s.className = "sample-tag"; s.textContent = "Sample review"; card.prepend(s); }
    return card;
  }));
  // The average is only shown for real reviews, never for samples.
  if (reviews.length && !reviews.some(r => r.sample)) {
    const avg = reviews.reduce((a, r) => a + r.stars, 0) / reviews.length;
    const s = $("rv-summary");
    s.innerHTML = '<span class="rv-avg"></span><span class="stars"></span><span></span>';
    s.children[0].textContent = avg.toFixed(1);
    s.children[1].textContent = stars(avg);
    s.children[2].textContent = "from " + reviews.length + " reviews on Google";
    s.hidden = false;
  }
  if (R.profileUrl) { $("rv-all").href = R.profileUrl; $("rv-all").hidden = false; }
  if (R.writeUrl) { $("rv-write").href = R.writeUrl; $("rv-write").hidden = false; }

  /* ---------- running brand strip ---------- */
  // Repeat the brand list until one copy is wider than the strip, then add a second identical copy for the CSS loop.
  const strip = document.querySelector(".brands"), track = strip && strip.querySelector(".brands-track");
  if (track) {
    const base = [...track.children];
    let n = 0;
    while (track.scrollWidth < strip.clientWidth + 200 && n++ < 10)
      base.forEach(li => { const c = li.cloneNode(true); c.setAttribute("aria-hidden", "true"); track.append(c); });
    [...track.children].forEach(li => { const c = li.cloneNode(true); c.setAttribute("aria-hidden", "true"); track.append(c); });
    strip.style.setProperty("--brands-time", Math.round(track.scrollWidth / 2 / 70) + "s");   // ~70px a second at any screen size
  }

  /* ---------- one screen at a time ---------- */
  // The page never scrolls freely: wheel, swipe and keys move a whole screen with an eased scroll animation.
  // Screens: the footage, each .sec, and last the closing .sec-cta, which is sized so that it plus the footer fill the window.
  const root = document.documentElement, bar = document.querySelector(".topbar"), footer = $("site-footer"), cta = $("cta");
  const screens = [document.querySelector(".hero"), ...document.querySelectorAll(".sec:not([hidden])")];
  const NAMES_SCREENS = ["Top", "Before & after", "Reviews", "Product quality", "Contact"];
  const DUR = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 850;
  let cur = 0, busy = false, lastWheel = 0, lastDelta = 0, paging = true;

  // whole pixels, rounded down, so the screen above can never show through under the bar
  const barH = () => Math.floor(bar.getBoundingClientRect().height);
  const target = i => Math.min(i === 0 ? 0 : Math.round(scrollY + screens[i].getBoundingClientRect().top) - barH(), root.scrollHeight - innerHeight);
  function layout() {
    root.classList.remove("free-scroll");
    root.style.setProperty("--app-h", innerHeight + "px");
    root.style.setProperty("--bar-h", barH() + "px");
    const footerH = footer.getBoundingClientRect().height;
    cta.style.height = Math.max(0, innerHeight - barH() - footerH) + "px";
    // shrink a section's content to fit when the window is too short for it
    let smallest = 1;
    document.querySelectorAll(".sec:not(.sec-cta)").forEach(sec => {
      const inner = sec.querySelector(".sec-in"), cs = getComputedStyle(sec);
      inner.style.transform = "";
      const room = sec.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = Math.min(1, room / inner.offsetHeight);
      smallest = Math.min(smallest, s);
      inner.style.transform = s < 1 ? `scale(${s.toFixed(3)})` : "";
    });
    // On very short windows (a phone held sideways) the screens would have to shrink too far to read, or the footer
    // alone is taller than the window: there the page falls back to ordinary scrolling.
    paging = smallest >= .6 && footerH <= innerHeight - barH();
    if (!paging) {
      root.classList.add("free-scroll");
      cta.style.height = "";
      document.querySelectorAll(".sec-in").forEach(el => { el.style.transform = ""; });
      return;
    }
    scrollTo(0, target(cur));
  }

  const dots = document.createElement("nav");
  dots.className = "pager-dots"; dots.setAttribute("aria-label", "Sections");
  screens.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("aria-label", NAMES_SCREENS[i] || "Section " + (i + 1));
    b.addEventListener("click", () => go(i));
    dots.append(b);
  });
  document.body.append(dots);
  const markDots = () => [...dots.children].forEach((b, i) => b.setAttribute("aria-current", i === cur));

  function go(i) {
    if (!paging) { screens[Math.max(0, Math.min(screens.length - 1, i))].scrollIntoView({ behavior: "smooth" }); return; }
    i = Math.max(0, Math.min(screens.length - 1, i));
    if (i === cur || busy) return;
    cur = i; busy = true; markDots();
    const y0 = scrollY, y1 = target(i), t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const frame = now => {
      const t = DUR ? Math.min(1, (now - t0) / DUR) : 1;
      scrollTo(0, y0 + (y1 - y0) * ease(t));
      if (t < 1) requestAnimationFrame(frame); else setTimeout(() => { busy = false; }, 150);
    };
    requestAnimationFrame(frame);
  }

  // Wheel / trackpad: one move per gesture. A trackpad keeps sending shrinking deltas after the fingers lift,
  // so a new move needs a pause in the events or a delta that grows again.
  addEventListener("wheel", e => {
    if (!paging || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // pinch-zoom, sideways swipes in the card rows
    e.preventDefault();
    const now = performance.now(), d = Math.abs(e.deltaY), fresh = now - lastWheel > 220 || d > lastDelta * 1.6 + 4;
    lastWheel = now; lastDelta = d;
    if (!busy && fresh && d > 2) go(cur + Math.sign(e.deltaY));
  }, { passive: false });

  let tx = 0, ty = null;
  addEventListener("touchstart", e => { if (paging) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } }, { passive: true });
  addEventListener("touchmove", e => {
    if (ty === null) return;
    const dx = e.touches[0].clientX - tx, dy = e.touches[0].clientY - ty;
    if (Math.abs(dy) > Math.abs(dx)) e.preventDefault();   // vertical swipes page; sideways ones still scroll the card rows
  }, { passive: false });
  addEventListener("touchend", e => {
    if (ty === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    ty = null;
    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) go(cur + (dy < 0 ? 1 : -1));
  });

  addEventListener("keydown", e => {
    const t = e.target instanceof Element ? e.target : document.body;
    if (!paging || e.altKey || e.ctrlKey || e.metaKey || t.closest("input, textarea, select, [contenteditable], #ba-jobs, #ba-handle")) return;
    const isBtn = t.closest("button, a");
    const d = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key] ?? (e.key === " " && !isBtn ? (e.shiftKey ? -1 : 1) : 0);
    if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(screens.length - 1); }
    else if (d) { e.preventDefault(); go(cur + d); }
  });

  // Tabbing into another screen brings that whole screen in.
  addEventListener("focusin", e => {
    if (!paging || e.target.closest(".pager-dots, .topbar")) return;
    const i = e.target.closest("#site-footer") ? screens.length - 1 : screens.findIndex(s => s.contains(e.target));
    if (i < 0) return;
    if (i !== cur) go(i); else scrollTo(0, target(cur));
  });
  // index.html#install etc. play a clip from the top screen
  addEventListener("hashchange", () => { cur = 0; markDots(); scrollTo(0, 0); });

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  addEventListener("resize", layout);
  addEventListener("load", layout);
  layout(); markDots();

  /* ---------- sparks over the closing screen's fire ---------- */
  // Glowing specks drift up from the bottom, swaying and fading. Runs only while the closing screen is on view.
  const ec = $("cta-embers");
  if (ec && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const g = ec.getContext("2d");
    const sprite = document.createElement("canvas");   // one soft glowing dot, drawn once and stamped for every spark
    sprite.width = sprite.height = 64;
    const sg = sprite.getContext("2d"), grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,240,200,1)"); grad.addColorStop(.25, "rgba(255,170,60,.9)"); grad.addColorStop(.6, "rgba(230,70,20,.35)"); grad.addColorStop(1, "rgba(200,30,0,0)");
    sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);
    let W = 0, H = 0, sparks = [], running = false, last = 0;
    const spawn = (anywhere) => ({ x: Math.random() * W, y: anywhere ? Math.random() * H : H + 10, r: (2 + Math.random() * 5) * devicePixelRatio,
      vy: (25 + Math.random() * 60) * devicePixelRatio, sway: 10 + Math.random() * 30, phase: Math.random() * 6.3, life: 0, max: 3 + Math.random() * 4 });
    const fit = () => {
      W = ec.width = Math.round(ec.clientWidth * devicePixelRatio); H = ec.height = Math.round(ec.clientHeight * devicePixelRatio);
      sparks = Array.from({ length: Math.min(110, Math.round(ec.clientWidth / 14)) }, () => spawn(true));
    };
    const tick = now => {
      if (!running) return;
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < sparks.length; i++) {
        const p = sparks[i];
        p.life += dt; p.y -= p.vy * dt; p.phase += dt * 1.6;
        const x = p.x + Math.sin(p.phase) * p.sway * devicePixelRatio;
        const fade = Math.min(1, p.life / .6) * Math.max(0, 1 - p.life / p.max) * (.7 + .3 * Math.sin(p.phase * 4));
        if (fade <= 0 || p.y < -20) { sparks[i] = spawn(false); continue; }
        g.globalAlpha = fade;
        const s = p.r * 4; g.drawImage(sprite, x - s / 2, p.y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      requestAnimationFrame(tick);
    };
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(ec); else addEventListener("resize", fit);   // the screen's height is set by the pager
    new IntersectionObserver(es => {
      const on = es[0].isIntersecting;
      if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
      running = on;
    }).observe(ec);
  }

  /* ---------- scroll-in ---------- */
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) items.forEach(el => el.classList.add("seen"));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
    items.forEach(el => io.observe(el));
  }
})();
