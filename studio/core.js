// Studio portal core: login, agent settings, screen routing and shared helpers.
// Screens are <section class="view" data-view="..."> blocks; the URL hash picks one (#/leads, #/customer/12 ...).
window.Studio = (() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  let password = store.get("studioPw") || "";
  const agent = () => { try { return JSON.parse(store.get("studioAgent")) || {}; } catch { return {}; } };

  async function api(endpoint, body) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, agent: agent().name || "", ...body }),
    });
    let data = {};
    try { data = await r.json(); } catch { data = { error: `שגיאת שרת (${r.status})` }; }
    if (r.status === 401) logout();
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
    document.body.classList.toggle("authed", name !== "login");
    // the visualizer and forms sit in the plain block; the dashboard draws its own cards
    document.querySelector(".app-main .block").classList.toggle("bare", name === "home");
    const a = agent();
    for (const el of document.querySelectorAll("[data-agent-name]")) el.textContent = a.name || "סוכן";
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
    if (!password) return show("login");
    const [name = "home", ...params] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const r = routes[name] || routes.home;
    show(r.view, routes[name] ? name : "home");
    try { r.render(...params.map(decodeURIComponent)); } catch (e) { console.error(e); }
  }
  window.addEventListener("hashchange", render);

  /* ---------- login ---------- */
  function logout() {
    password = "";
    store.set("studioPw", null);
    show("login");
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginErr").textContent = "";
    password = $("pw").value;
    try {
      await api("/api/studio", { action: "login" });
      store.set("studioPw", password);
      $("pw").value = "";
      if (!agent().name) go("#/settings"); else go("#/");
    } catch (err) {
      password = "";
      $("loginErr").textContent = err.message;
    }
  });
  $("logout").addEventListener("click", logout);
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

  return { $, store, api, crm, agent, route, go, render, toast, esc, waNumber, fmtDate, ago, localInput, sizeTo, setCounts };
})();
