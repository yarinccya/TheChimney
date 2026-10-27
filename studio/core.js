// Studio portal core: the signed-in employee, screen routing and shared helpers.
// Screens are <section class="view" data-view="..."> blocks; the URL hash picks one (#/leads, #/customer/12 ...).
window.Studio = (() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  // The signed-in employee, loaded from the server on start (api/_auth.js decides who that is).
  let me = null;
  const agent = () => me || {};

  async function api(endpoint, body) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await r.json(); } catch { data = { error: `שגיאת שרת (${r.status})` }; }
    if (!r.ok) throw new Error(data.error || `שגיאה ${r.status}`);
    return data;
  }
  const crm = (action, args = {}) => api("/api/crm", { action, ...args });

  /* ---------- routing ---------- */
  const routes = {}; // route name → { view, render(...params) }
  const route = (name, view, render) => { routes[name] = { view, render }; };

  function show(name, navKey = name) {
    for (const v of document.querySelectorAll(".view")) v.classList.toggle("on", v.dataset.view === name);
    for (const a of document.querySelectorAll("[data-nav]")) a.classList.toggle("on", a.dataset.nav === navKey);
    // the visualizer and forms sit in the plain block; the dashboard draws its own cards
    document.querySelector(".app-main .block").classList.toggle("bare", name === "home");
    const a = agent();
    for (const el of document.querySelectorAll("[data-agent-name]")) el.textContent = a.name || "הפרופיל שלי";
    for (const el of document.querySelectorAll("[data-agent-role]")) el.textContent = a.role || "סוכן מכירות";
    for (const el of document.querySelectorAll("[data-initial]")) el.textContent = (a.name || "?").trim().charAt(0);
  }

  // Menu badges (pending leads, calls due today), shared by the side menu and the phone tabs.
  function setCounts({ leads, calls }) {
    for (const el of document.querySelectorAll('[data-count="leads"]')) el.textContent = leads || "";
    for (const el of document.querySelectorAll('[data-count="calls"]')) el.textContent = calls || "";
  }

  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  function render() {
    if (!me) return;
    const [name = "home", ...params] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const r = routes[name] || routes.home;
    show(r.view, routes[name] ? name : "home");
    try { r.render(...params.map(decodeURIComponent)); } catch (e) { console.error(e); }
  }
  window.addEventListener("hashchange", render);

  /* ---------- start: load the signed-in employee, then the screen ---------- */
  async function start() {
    try {
      me = await crm("me");
      // Before profiles lived on the server, the name was kept in this browser - carry it over once.
      const legacy = (() => { try { return JSON.parse(store.get("studioAgent")) || {}; } catch { return {}; } })();
      if (!me.name && legacy.name) me = await crm("updateMe", { profile: legacy });
      store.set("studioAgent", null);
      store.set("studioPw", null);
    } catch (e) {
      document.body.innerHTML = `<p style="padding:2rem;text-align:center">לא הצלחתי להתחבר לשרת: ${esc(e.message)}</p>`;
      return;
    }
    render();
  }
  const setMe = (m) => { me = m; };

  $("topSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("topQ").value.trim();
    $("topQ").value = "";
    go(`#/customers/${encodeURIComponent(q)}`);
  });

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // wa.me needs an international number; local Israeli numbers (05x...) get 972.
  const waNumber = (phone) => {
    const d = String(phone || "").replace(/\D/g, "");
    return d.startsWith("0") ? "972" + d.slice(1) : d;
  };

  const fmtDate = (v, withTime = true) => {
    if (!v) return "";
    const d = new Date(v);
    return d.toLocaleString("he-IL", withTime
      ? { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "numeric", year: "numeric" });
  };

  const ago = (v) => {
    const m = Math.round((Date.now() - new Date(v)) / 60000);
    if (m < 1) return "עכשיו";
    if (m < 60) return `לפני ${m} דק׳`;
    const h = Math.round(m / 60);
    if (h < 24) return `לפני ${h} שע׳`;
    const days = Math.round(h / 24);
    return days === 1 ? "אתמול" : `לפני ${days} ימים`;
  };

  // <input type="datetime-local"> value for a Date, in local time
  const localInput = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  let toastTimer;
  function toast(msg, bad = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("bad", bad);
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // Keep an element at a fixed aspect ratio, as large as its .fitbox parent allows.
  const sized = new Map();
  const applySize = (el, [w, h]) => {
    const box = el.parentElement;
    if (!box) return;
    const s = Math.min(box.clientWidth / w, box.clientHeight / h);
    if (s > 0) { el.style.width = `${w * s}px`; el.style.height = `${h * s}px`; }
  };
  const fitObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) for (const [el, wh] of sized) if (el.parentElement === target) applySize(el, wh);
  });
  function sizeTo(el, w, h) {
    sized.set(el, [w, h]);
    fitObserver.observe(el.parentElement);
    applySize(el, [w, h]);
  }

  /* ---------- no scrolling anywhere: rows that don't fit are hidden or paged ---------- */
  // Hide the rows (.item) that don't fit inside box; returns how many were hidden.
  function fitRows(box) {
    const items = [...box.querySelectorAll(":scope > .item")];
    for (const it of items) it.hidden = false;
    const bottom = box.getBoundingClientRect().bottom + 0.5;
    let hidden = 0;
    for (const it of items) if (hidden || it.getBoundingClientRect().bottom > bottom) { it.hidden = true; hidden++; }
    return hidden;
  }

  // Show nodes in box a page at a time - as many rows as fit - with ‹ › controls in pager.
  const pages = new WeakMap();
  function paginate(box, nodes, pager, empty = "") {
    pages.set(box, { nodes, pager, page: 0, empty });
    layoutPage(box);
    if (!box.dataset.paged) {
      box.dataset.paged = "1";
      let h = 0;
      new ResizeObserver(() => { if (Math.abs(box.clientHeight - h) > 4) { h = box.clientHeight; layoutPage(box); } }).observe(box);
      pager.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        const st = pages.get(box);
        if (!b || !st) return;
        st.page += b.dataset.dir === "next" ? 1 : -1;
        layoutPage(box);
      });
    }
  }
  function layoutPage(box) {
    const st = pages.get(box);
    if (!st || !box.clientHeight) return;
    const { nodes, pager } = st;
    if (!nodes.length) {
      box.innerHTML = st.empty ? `<div class="none">${st.empty}</div>` : "";
      pager.hidden = true;
      return;
    }
    box.replaceChildren(...nodes);
    for (const n of nodes) n.hidden = false;
    // rows are the same height, so measure one and divide
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    const rowH = nodes[0].getBoundingClientRect().height + gap;
    const per = Math.max(1, Math.floor((box.clientHeight + gap) / rowH));
    const count = Math.ceil(nodes.length / per);
    st.page = Math.min(Math.max(0, st.page), count - 1);
    nodes.forEach((n, i) => { n.hidden = Math.floor(i / per) !== st.page; });
    pager.hidden = count < 2;
    pager.innerHTML = `<button type="button" data-dir="prev" ${st.page === 0 ? "disabled" : ""}>› הקודם</button>
      <span>${st.page + 1} / ${count}</span>
      <button type="button" data-dir="next" ${st.page === count - 1 ? "disabled" : ""}>הבא ‹</button>`;
  }

  return { $, store, api, crm, agent, setMe, start, fitRows, paginate, route, go, render, toast, esc, waNumber, fmtDate, ago, localInput, sizeTo, setCounts };
})();
