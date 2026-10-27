// Sales agents' screens: dashboard, leads, call-backs, customer card, customer and order forms, settings.
(() => {
  const { $, crm, go, route, toast, esc, waNumber, fmtDate, ago, localInput, agent, store, fitRows, paginate } = Studio;

  const STATUS = { new: "ליד חדש", follow_up: "לחזור", customer: "לקוח", closed: "לא רלוונטי" };
  const ORDER_STATUS = { new: "חדשה", confirmed: "אושרה", scheduled: "נקבעה התקנה", done: "בוצעה", cancelled: "בוטלה" };
  const SOURCE = { phone: "טלפון", website: "אתר", referral: "המלצה", social: "רשתות חברתיות", field: "שטח", other: "אחר" };
  const PHONE_ICON = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>';

  // Each screen render bumps this; a slow response for an old screen is dropped.
  let seq = 0;
  const fresh = () => { const n = ++seq; return () => n === seq; };

  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const money = (v) => v == null ? "" : `₪${Number(v).toLocaleString("he-IL")}`;

  /* ---------- dashboard ---------- */
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const compact = (v) => `₪${new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0)}`;
  const mine = () => (store.get("studioMine") ?? "1") === "1" && !!agent().name;

  // Two copies of the switch: the desktop dashboard and the phone one.
  const scopes = document.querySelectorAll("[data-scope]");
  function setScope() {
    for (const sc of scopes) for (const b of sc.children) b.classList.toggle("on", (b.dataset.mine === "1") === mine());
  }
  for (const sc of scopes) sc.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mine === "1" && !agent().name) return go("#/settings");
    store.set("studioMine", b.dataset.mine);
    Studio.render();
  });

  // Menu badges on every screen; the dashboard fills them from its own data.
  let countsAt = 0;
  async function refreshCounts(force) {
    if (!agent().id || (!force && Date.now() - countsAt < 30000)) return;
    countsAt = Date.now();
    try { Studio.setCounts(await crm("counts", { mine: mine(), tz: TZ })); } catch {}
  }
  window.addEventListener("hashchange", () => refreshCounts());

  function kpi({ label, value, sub = "", href, hero }) {
    const tag = href ? "a" : "div";
    return `<${tag} class="kpi${hero ? " hero" : ""}"${href ? ` href="${href}"` : ""}>
      <span class="k-label">${label}</span><span class="k-value">${value}</span><span class="k-sub">${sub}</span></${tag}>`;
  }

  function renderKpis(k) {
    const prev = k.prev_month_to_date, cur = k.month_revenue;
    let delta = "";
    if (prev > 0) {
      const p = Math.round(((cur - prev) / prev) * 100);
      delta = `<span class="delta ${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%</span> לעומת אותה תקופה בחודש שעבר ·`;
    }
    const conv = k.month_customers ? Math.round((k.month_won / k.month_customers) * 100) : null;
    $("kpis").innerHTML = [
      kpi({ hero: true, label: "הכנסות החודש", value: money(cur) || "₪0", sub: `${delta} ${k.month_orders} הזמנות`, href: "#/orders" }),
      kpi({
        label: "שיחות להיום", value: k.calls_due, href: "#/callbacks",
        sub: k.calls_overdue ? `<span class="flag bad">⚠ ${k.calls_overdue} באיחור</span>` : k.calls_due ? "הכל בזמן" : "אין שיחות פתוחות",
      }),
      kpi({ label: "לידים ממתינים", value: k.leads_new, href: "#/leads", sub: k.leads_today ? `<span class="flag warn">● ${k.leads_today} נכנסו היום</span>` : "אין לידים חדשים היום" }),
      kpi({ label: "הזמנות פתוחות", value: k.open_orders, href: "#/orders", sub: `בשווי ${compact(k.open_value)}` }),
      kpi({ label: "יחס סגירה החודש", value: conv == null ? "—" : `${conv}%`, sub: k.month_customers ? `${k.month_won} מתוך ${k.month_customers} לקוחות שנפתחו` : "אין עדיין לקוחות החודש" }),
    ].join("");
  }

  function miniItem(c, { when = "", tag = "", sub }) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div class="main"><div class="name">${esc(c.name)}</div><div class="sub">${esc(sub) || "&nbsp;"}</div></div>
      ${tag}${when ? `<span class="when">${esc(when)}</span>` : ""}
      ${c.phone ? `<a class="callbtn" href="tel:${esc(c.phone)}" aria-label="התקשר ל${esc(c.name)}">${PHONE_ICON}</a>` : ""}`;
    el.addEventListener("click", (e) => { if (!e.target.closest(".callbtn")) go(`#/customer/${c.customer_id || c.id}`); });
    return el;
  }

  function installItem(o) {
    const dt = new Date(`${o.install_date}T12:00:00`);
    const el = document.createElement("a");
    el.className = "item";
    el.href = `#/order/${o.customer_id}/${o.id}`;
    el.innerHTML = `<span class="date-chip"><b>${dt.getDate()}</b><small>${dt.toLocaleDateString("he-IL", { weekday: "short" })}</small></span>
      <div class="main"><div class="name">${esc(o.name)}</div><div class="sub">${esc([o.product || o.service, o.address].filter(Boolean).join(" · "))}</div></div>
      <span class="when">${money(o.price)}</span>`;
    return el;
  }

  function fill(box, nodes, empty) {
    if (nodes.length) box.replaceChildren(...nodes);
    else box.innerHTML = `<div class="empty-p">${empty}</div>`;
  }

  // Dashboard panels: rows that don't fit are hidden; the panel's link says how many more there are.
  const panels = [];
  function panelList(box, nodes, empty, total, link, label) {
    fill(box, nodes, empty);
    const fit = () => {
      const hidden = fitRows(box) + Math.max(0, total - nodes.length);
      link.textContent = hidden ? `עוד ${hidden} ←` : label;
    };
    const p = panels.find((x) => x.box === box);
    if (p) p.fit = fit; else {
      const entry = { box, fit, h: 0 };
      panels.push(entry);
      new ResizeObserver(() => { if (Math.abs(box.clientHeight - entry.h) > 4) { entry.h = box.clientHeight; entry.fit(); } }).observe(box);
    }
    fit();
  }

  // Weekly revenue: one series, columns, current week in the accent step.
  // Drawn at the box's real width, so the 11px text stays 11px on a phone.
  let chartWeeks = null, chartW = 0, chartH = 0;
  new ResizeObserver(() => {
    const b = $("dChart");
    if (chartWeeks && b.clientWidth && (Math.abs(b.clientWidth - chartW) > 20 || Math.abs(b.clientHeight - chartH) > 12)) revenueChart(chartWeeks);
  }).observe($("dChart"));

  function revenueChart(weeks) {
    chartWeeks = weeks;
    chartW = $("dChart").clientWidth;
    chartH = $("dChart").clientHeight;
    const W = Math.max(300, Math.round(chartW || 640)), H = Math.max(120, Math.round(chartH || 210)), padL = 44, padB = 26, padT = 18, plotW = W - padL - 8, plotH = H - padB - padT;
    const max = Math.max(...weeks.map((w) => w.revenue)) || 10000;
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / (step / 2)) * (step / 2);
    const y = (v) => padT + plotH - (v / top) * plotH;
    const slot = plotW / weeks.length, bw = Math.min(24, slot * 0.55);
    const narrow = slot < 44; // phones: date labels on every other week
    const best = weeks.reduce((m, w, i) => (w.revenue > weeks[m].revenue ? i : m), 0);
    const day = (s) => { const [, m, d] = s.split("-"); return `${+d}.${+m}`; };

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="הכנסות לפי שבוע, 8 שבועות אחרונים" direction="ltr">`;
    for (const t of [0, top / 2, top]) {
      svg += `<line x1="${padL}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/>
        <text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`;
    }
    weeks.forEach((w, i) => {
      const cx = padL + slot * i + slot / 2, x = cx - bw / 2, yt = y(w.revenue), base = y(0);
      const now = i === weeks.length - 1;
      if (w.revenue > 0) {
        const r = Math.min(4, base - yt);
        svg += `<path class="col" data-i="${i}" fill="${now ? "var(--bar-now)" : "var(--bar-past)"}"
          d="M${x},${base} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${base} Z"/>`;
      }
      if ((now || i === best) && w.revenue > 0) svg += `<text class="lbl-val" x="${cx}" y="${yt - 6}" text-anchor="middle">${compact(w.revenue)}</text>`;
      if (now || !narrow || (weeks.length - 1 - i) % 2 === 0) svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${now ? "השבוע" : day(w.week)}</text>`;
      svg += `
        <rect class="hit" data-i="${i}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH}"/>`;
    });
    svg += `</svg>`;
    const table = `<table class="sr"><caption>הכנסות לפי שבוע</caption><tr><th>שבוע</th><th>הכנסות</th><th>הזמנות</th></tr>${
      weeks.map((w) => `<tr><td>${day(w.week)}</td><td>${money(w.revenue)}</td><td>${w.orders}</td></tr>`).join("")}</table>`;
    const box = $("dChart");
    box.innerHTML = svg + table + '<div class="tip" hidden></div>';

    const tip = box.querySelector(".tip");
    box.querySelector("svg").addEventListener("pointermove", (e) => {
      const hit = e.target.closest(".hit");
      for (const c of box.querySelectorAll(".col")) c.classList.toggle("hover", hit && c.dataset.i === hit.dataset.i);
      if (!hit) { tip.hidden = true; return; }
      const w = weeks[hit.dataset.i], r = hit.getBoundingClientRect(), br = box.getBoundingClientRect();
      tip.innerHTML = `שבוע מ-${day(w.week)}: <b>${money(w.revenue)}</b> · ${w.orders} הזמנות`;
      tip.style.left = `${r.left - br.left + r.width / 2}px`;
      tip.style.top = `${Math.max(0, e.clientY - br.top)}px`;
      tip.hidden = false;
    });
    box.querySelector("svg").addEventListener("pointerleave", () => {
      tip.hidden = true;
      for (const c of box.querySelectorAll(".col")) c.classList.remove("hover");
    });
  }

  function funnel(pipeline, k) {
    const n = Object.fromEntries(pipeline.map((p) => [p.status, p.n]));
    const rows = [["new", "לידים חדשים"], ["follow_up", "בטיפול"], ["customer", "לקוחות"], ["closed", "לא רלוונטי"]];
    const max = Math.max(1, ...rows.map(([s]) => n[s] || 0));
    $("dFunnel").innerHTML = rows.map(([s, label]) => {
      const v = n[s] || 0, pct = (v / max) * 82;
      return `<div class="frow" title="${label}: ${v}"><span class="fl">${label}</span>
        <span class="ft"><span class="fb" style="width:${pct}%"></span><span class="fv" style="inset-inline-start:calc(${pct}% + 6px)">${v}</span></span></div>`;
    }).join("");
    $("dConv").textContent = k.month_customers ? `סגירה החודש: ${Math.round((k.month_won / k.month_customers) * 100)}%` : "";
  }

  /* ---------- phone dashboard: everything on one screen ---------- */
  let mData = null, mTab = null;

  function spark(weeks) {
    const W = 104, H = 46, n = weeks.length, slot = W / n, bw = Math.min(8, slot - 3);
    const max = Math.max(1, ...weeks.map((w) => w.revenue));
    return `<svg viewBox="0 0 ${W} ${H}" direction="ltr">${weeks.map((w, i) => {
      const h = Math.max(2, (w.revenue / max) * (H - 2)), x = i * slot + (slot - bw) / 2, y = H - h, r = Math.min(2, h / 2);
      return `<path fill="${i === n - 1 ? "var(--bar-now)" : "var(--bar-past)"}" d="M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H} Z"/>`;
    }).join("")}</svg>`;
  }

  // Show only the rows that fit the panel; the rest go behind "N more".
  function fitList() {
    const box = $("mList"), items = [...box.querySelectorAll(".item")];
    for (const it of items) it.hidden = false;
    const bottom = box.getBoundingClientRect().bottom - 6;
    let hidden = 0;
    for (const it of items) if (it.getBoundingClientRect().bottom > bottom) { it.hidden = true; hidden++; }
    return hidden;
  }

  function renderMobileList() {
    const d = mData, now = new Date();
    const tabs = {
      calls: {
        rows: d.calls, href: "#/callbacks", empty: "אין שיחות להיום 🎉", total: d.kpis.calls_due,
        make: (c) => {
          const t = new Date(c.follow_up_at);
          const tag = t < now ? '<span class="tag late">באיחור</span>'
            : `<span class="tag today">${t.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>`;
          return miniItem(c, { tag, sub: [c.service, c.address].filter(Boolean).join(" · ") });
        },
      },
      leads: {
        rows: d.leads, href: "#/leads", empty: "אין לידים ממתינים", total: d.kpis.leads_new,
        make: (c) => miniItem(c, { when: ago(c.created_at), sub: [c.service, SOURCE[c.source] || c.source].filter(Boolean).join(" · ") }),
      },
      installs: {
        rows: d.installs, href: "#/orders", empty: "אין התקנות בשבועיים הקרובים", total: d.installs.length,
        make: installItem,
      },
    };
    for (const b of $("mTabs").children) {
      const t = tabs[b.dataset.t];
      b.classList.toggle("on", b.dataset.t === mTab);
      b.setAttribute("aria-selected", b.dataset.t === mTab);
      b.querySelector("em")?.remove();
      if (t.total) b.insertAdjacentHTML("beforeend", `<em>${t.total}</em>`);
    }
    const t = tabs[mTab];
    fill($("mList"), t.rows.map(t.make), t.empty);
    const hidden = fitList() + Math.max(0, t.total - t.rows.length);
    $("mMore").href = t.href;
    $("mMore").textContent = t.rows.length ? (hidden ? `עוד ${hidden} ←` : "לכל הרשימה ←") : "";
  }
  $("mTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !mData) return;
    mTab = b.dataset.t;
    renderMobileList();
  });
  let mListH = 0;
  new ResizeObserver(() => {
    const h = $("mList").clientHeight;
    if (mData && h && Math.abs(h - mListH) > 8) { mListH = h; renderMobileList(); }
  }).observe($("mList"));

  function renderMobile(d, hello) {
    const k = d.kpis;
    mData = d;
    $("mHello").textContent = hello;
    $("mRev").textContent = money(k.month_revenue) || "₪0";
    let sub = `${k.month_orders} הזמנות`;
    if (k.prev_month_to_date > 0) {
      const p = Math.round(((k.month_revenue - k.prev_month_to_date) / k.prev_month_to_date) * 100);
      sub = `<span class="delta ${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%</span> מהחודש שעבר · ${sub}`;
    }
    $("mRevSub").innerHTML = sub;
    $("mSpark").innerHTML = spark(d.weeks);
    const conv = k.month_customers ? `${Math.round((k.month_won / k.month_customers) * 100)}%` : "—";
    const tiles = [
      ["#/callbacks", k.calls_due, "שיחות היום", k.calls_overdue ? `<small class="bad">${k.calls_overdue} באיחור</small>` : '<small class="ok">בזמן</small>'],
      ["#/leads", k.leads_new, "לידים", k.leads_today ? `<small class="warn">+${k.leads_today} היום</small>` : '<small class="ok">—</small>'],
      ["#/orders", k.open_orders, "הזמנות פתוחות", `<small class="ok">${compact(k.open_value)}</small>`],
      ["", conv, "סגירה החודש", `<small class="ok">${k.month_won}/${k.month_customers}</small>`],
    ];
    $("mKpis").innerHTML = tiles.map(([href, v, label, extra]) => href
      ? `<a class="mk" href="${href}"><b>${v}</b><span>${label}</span>${extra}</a>`
      : `<div class="mk"><b>${v}</b><span>${label}</span>${extra}</div>`).join("");
    const n = Object.fromEntries(d.pipeline.map((p) => [p.status, p.n]));
    $("mPipe").innerHTML = `<span>חדשים <b>${n.new || 0}</b></span><i>‹</i><span>בטיפול <b>${n.follow_up || 0}</b></span><i>‹</i>`
      + `<span>לקוחות <b>${n.customer || 0}</b></span><i>·</i><span>לא רלוונטי <b>${n.closed || 0}</b></span>`;
    if (!mTab) mTab = d.calls.length ? "calls" : d.leads.length ? "leads" : "installs";
    renderMobileList();
  }

  route("home", "home", async () => {
    const live = fresh();
    const name = agent().name;
    const h = new Date().getHours();
    $("hello").textContent = `${h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב"}${name ? ", " + name : ""}`;
    $("today").textContent = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    setScope();
    try {
      const d = await crm("dashboard", { mine: mine(), tz: TZ });
      if (!live()) return;
      const k = d.kpis;
      countsAt = Date.now();
      Studio.setCounts({ leads: k.leads_new, calls: k.calls_due });
      renderKpis(k);

      const now = new Date();
      panelList($("dCalls"), d.calls.map((c) => {
        const t = new Date(c.follow_up_at), late = t < now;
        const tag = late ? `<span class="tag late" title="${fmtDate(t)}">באיחור</span>` : `<span class="tag today">${t.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>`;
        return miniItem(c, { tag, sub: [c.service, c.address].filter(Boolean).join(" · ") });
      }), "אין שיחות להיום 🎉", k.calls_due, $("dCallsLink"), "לכל הרשימה ←");

      panelList($("dLeads"), d.leads.map((c) => miniItem(c, {
        when: ago(c.created_at), sub: [c.service, SOURCE[c.source] || c.source].filter(Boolean).join(" · "),
      })), "אין לידים ממתינים", k.leads_new, $("dLeadsLink"), "לכל הלידים ←");

      revenueChart(d.weeks);
      funnel(d.pipeline, k);
      renderMobile(d, $("hello").textContent);

      panelList($("dInstalls"), d.installs.map(installItem), "אין התקנות בשבועיים הקרובים", d.installs.length, $("dInstallsLink"), "לכל ההזמנות ←");
    } catch (e) {
      if (live()) toast(e.message, true);
    }
  });

  /* ---------- orders ---------- */
  let ordFilter = "open";
  route("orders", "orders", async () => {
    const live = fresh();
    for (const b of $("ordFilter").children) b.classList.toggle("on", b.dataset.f === ordFilter);
    $("ordBody").innerHTML = '<div class="none">טוען…</div>';
    $("ordPager").hidden = true;
    try {
      const rows = await crm("orders", { filter: ordFilter, mine: mine() });
      if (!live()) return;
      paginate($("ordBody"), rows.map((o) => {
        const el = document.createElement("a");
        el.className = "item";
        el.href = `#/order/${o.customer_id}/${o.id}`;
        el.innerHTML = `<div class="main"><div class="name">#${o.id} · ${esc(o.name)}</div>
          <div class="sub">${esc([o.service, o.product, o.install_date ? `התקנה ${fmtDate(o.install_date, false)}` : "", o.agent].filter(Boolean).join(" · "))}</div></div>
          <span class="when">${money(o.price)}</span><span class="pill">${ORDER_STATUS[o.status] || o.status}</span>`;
        return el;
      }), $("ordPager"), ordFilter === "open" ? "אין הזמנות פתוחות" : "אין הזמנות עדיין");
    } catch (e) {
      if (live()) $("ordBody").innerHTML = `<div class="none">${esc(e.message)}</div>`;
    }
  });
  $("ordFilter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    ordFilter = b.dataset.f;
    Studio.render();
  });

  /* ---------- lists ---------- */
  let listFilter = "";
  function item(c, filter) {
    const el = document.createElement("div");
    el.className = "item";
    let when = "", cls = "";
    if (filter === "callbacks" && c.follow_up_at) {
      const d = new Date(c.follow_up_at), now = new Date();
      when = fmtDate(d);
      cls = d < now ? "late" : sameDay(d, now) ? "today" : "";
    } else {
      when = ago(c.created_at);
    }
    const sub = [c.service, c.address, filter === "leads" && c.source ? SOURCE[c.source] || c.source : "", filter === "" ? STATUS[c.status] : ""].filter(Boolean).join(" · ");
    el.innerHTML = `<div class="main"><div class="name">${esc(c.name)}</div><div class="sub">${esc(sub) || "&nbsp;"}</div></div>
      <span class="when ${cls}">${esc(when)}</span>
      ${c.phone ? `<a class="callbtn" href="tel:${esc(c.phone)}" aria-label="התקשר">${PHONE_ICON}</a>` : ""}`;
    el.addEventListener("click", (e) => { if (!e.target.closest(".callbtn")) go(`#/customer/${c.id}`); });
    return el;
  }

  async function showList(filter, title, q = "") {
    const live = fresh();
    listFilter = filter;
    $("listTitle").textContent = title;
    $("listQ").value = q;
    $("listCount").textContent = "";
    $("listBody").innerHTML = '<div class="none">טוען…</div>';
    $("listPager").hidden = true;
    try {
      const rows = await crm("list", { filter, q });
      if (!live()) return;
      $("listCount").textContent = rows.length ? `${rows.length}` : "";
      paginate($("listBody"), rows.map((c) => item(c, filter)), $("listPager"),
        q ? "לא נמצאו לקוחות" : filter === "leads" ? "אין לידים ממתינים 🎉" : filter === "callbacks" ? "אין לקוחות לחזור אליהם" : "אין לקוחות עדיין");
    } catch (e) {
      if (live()) $("listBody").innerHTML = `<div class="none">${esc(e.message)}</div>`;
    }
  }
  route("leads", "list", () => showList("leads", "לידים ממתינים"));
  route("callbacks", "list", () => showList("callbacks", "לקוחות לחזור אליהם"));
  route("customers", "list", (q = "") => showList("", q ? `חיפוש: ${q}` : "כל הלקוחות", q));
  $("listSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("listQ").value.trim();
    if (listFilter) showList(listFilter, $("listTitle").textContent, q);
    else go(`#/customers/${encodeURIComponent(q)}`);
  });

  /* ---------- customer card ---------- */
  let current = null; // { customer, orders, activity }

  let custId = null;
  route("customer", "customer", async (id) => {
    const live = fresh();
    if (id !== custId) { custId = id; custTab = "info"; }
    $("custBody").innerHTML = '<div class="none">טוען…</div>';
    try {
      const data = await crm("get", { id });
      if (!live()) return;
      current = data;
      renderCustomer();
    } catch (e) {
      if (live()) $("custBody").innerHTML = `<div class="none">${esc(e.message)}</div>`;
    }
  });

  let custTab = "info";
  function renderCustomer() {
    const { customer: c, orders, activity } = current;
    const followUp = c.status === "follow_up" && c.follow_up_at ? ` · ${fmtDate(c.follow_up_at)}` : "";
    const facts = [
      ["טלפון", c.phone], ["אימייל", c.email], ["כתובת", c.address], ["שירות", c.service],
      ["מקור", SOURCE[c.source] || c.source], ["נפתח", `${fmtDate(c.created_at)}${c.agent ? ` ע״י ${c.agent}` : ""}`],
    ].filter(([, v]) => v);

    $("custBody").innerHTML = `
      <div class="c-head">
        <h2>${esc(c.name)}</h2><span class="pill ${c.status}">${STATUS[c.status] || c.status}${esc(followUp)}</span>
      </div>
      <div class="c-actions">
        <a class="act green" href="tel:${esc(c.phone)}"><i>📞</i><span>התקשר</span></a>
        <a class="act" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener"><i>💬</i><span>וואטסאפ</span></a>
        <button class="act" type="button" id="cFollow"><i>⏰</i><span>לחזור אליו</span></button>
        <a class="act primary" href="#/order-new/${c.id}"><i>🧾</i><span>הזמנה</span></a>
        <button class="act" type="button" id="cWon"><i>✅</i><span>לקוח</span></button>
        <button class="act" type="button" id="cLost"><i>✖</i><span>לא רלוונטי</span></button>
        <a class="act" href="#/customer-edit/${c.id}"><i>✏️</i><span>עריכה</span></a>
      </div>
      <div class="mtabs c-tabs" id="cTabs" role="tablist">
        <button type="button" data-t="info">פרטים</button>
        <button type="button" data-t="orders">הזמנות<em>${orders.length}</em></button>
        <button type="button" data-t="log">תיעוד<em>${activity.length}</em></button>
      </div>
      <div class="c-pane" data-pane="info">
        <div class="facts">${facts.map(([k, v]) => `<div>${k}<b>${esc(v)}</b></div>`).join("")}</div>
        ${c.notes ? `<p class="c-notes" title="${esc(c.notes)}">${esc(c.notes)}</p>` : ""}
      </div>
      <div class="c-pane" data-pane="orders">
        <div class="pagebox list" id="cOrders"></div>
        <div class="pager" id="cOrdersPager" hidden></div>
      </div>
      <div class="c-pane" data-pane="log">
        <form class="addnote" id="noteForm">
          <input class="field" id="noteText" placeholder="מה היה בשיחה?">
          <button class="btn primary" type="submit">הוסף</button>
        </form>
        <div class="pagebox timeline" id="cLog"></div>
        <div class="pager" id="cLogPager" hidden></div>
      </div>`;

    const showTab = (t) => {
      custTab = t;
      for (const b of $("cTabs").children) b.classList.toggle("on", b.dataset.t === t);
      for (const p of $("custBody").querySelectorAll(".c-pane")) p.classList.toggle("on", p.dataset.pane === t);
      if (t === "orders") paginate($("cOrders"), orders.map((o) => {
        const el = document.createElement("a");
        el.className = "item";
        el.href = `#/order/${c.id}/${o.id}`;
        el.innerHTML = `<div class="main"><div class="name">#${o.id} · ${esc(o.service || o.product)}</div>
          <div class="sub">${esc([o.product, money(o.price), o.install_date ? `התקנה ${fmtDate(o.install_date, false)}` : ""].filter(Boolean).join(" · "))}</div></div>
          <span class="pill">${ORDER_STATUS[o.status] || o.status}</span>`;
        return el;
      }), $("cOrdersPager"), "אין הזמנות עדיין");
      if (t === "log") paginate($("cLog"), activity.map((a) => {
        const el = document.createElement("div");
        el.className = "item";
        el.title = a.text;
        el.innerHTML = `<span class="t">${esc(a.text)}</span><small>${fmtDate(a.created_at)}${a.agent ? ` · ${esc(a.agent)}` : ""}</small>`;
        return el;
      }), $("cLogPager"), "אין תיעוד עדיין");
    };
    $("cTabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showTab(b.dataset.t); });
    showTab(custTab);

    $("cFollow").addEventListener("click", () => openFollowUp(c));
    $("cWon").addEventListener("click", () => setStatus(c.id, "customer"));
    $("cLost").addEventListener("click", () => { if (confirm("לסמן את הלקוח כלא רלוונטי?")) setStatus(c.id, "closed"); });
    $("noteForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = $("noteText").value.trim();
      if (!text) return;
      try {
        await crm("addNote", { id: c.id, text });
        toast("ההערה נשמרה");
        custTab = "log";
        Studio.render();
      } catch (err) { toast(err.message, true); }
    });
  }

  async function setStatus(id, status, extra = {}) {
    try {
      await crm("setStatus", { id, status, ...extra });
      toast(status === "follow_up" ? "נקבעה תזכורת לחזור ללקוח" : `סומן: ${STATUS[status]}`);
      Studio.render();
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- follow-up dialog ---------- */
  let fuCustomer = null;
  function openFollowUp(c) {
    fuCustomer = c;
    const d = new Date(Date.now() + 24 * 3600e3);
    d.setHours(10, 0, 0, 0);
    $("fuWhen").value = localInput(c.follow_up_at ? new Date(c.follow_up_at) : d);
    $("fuNote").value = "";
    for (const ch of $("fuChips").children) ch.classList.remove("on");
    $("fuDialog").showModal();
  }
  $("fuChips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const d = new Date();
    if (b.dataset.in === "1h") d.setHours(d.getHours() + 1);
    if (b.dataset.in === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
    if (b.dataset.in === "2d") d.setDate(d.getDate() + 2);
    if (b.dataset.in === "7d") d.setDate(d.getDate() + 7);
    $("fuWhen").value = localInput(d);
    for (const ch of $("fuChips").children) ch.classList.toggle("on", ch === b);
  });
  $("fuDialog").addEventListener("close", () => {
    if ($("fuDialog").returnValue !== "ok" || !fuCustomer) return;
    setStatus(fuCustomer.id, "follow_up", { follow_up_at: new Date($("fuWhen").value).toISOString(), note: $("fuNote").value });
  });

  /* ---------- customer form ---------- */
  let editingId = null;
  async function customerForm(id) {
    const live = fresh();
    editingId = id || null;
    $("cf").reset();
    $("cfTitle").textContent = id ? "עריכת לקוח" : "פתיחת לקוח חדש";
    if (!id) return;
    try {
      const { customer } = await crm("get", { id });
      if (!live()) return;
      for (const f of ["name", "phone", "email", "address", "service", "source", "notes"]) $("cf").elements[f].value = customer[f] || "";
    } catch (e) { toast(e.message, true); }
  }
  route("customer-new", "customer-form", () => customerForm());
  route("customer-edit", "customer-form", (id) => customerForm(id));
  $("cfCancel").addEventListener("click", () => history.back());
  $("cf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const customer = Object.fromEntries(new FormData($("cf")));
    if (editingId) customer.id = editingId;
    try {
      const { id } = await crm("saveCustomer", { customer });
      toast(editingId ? "הלקוח עודכן" : "הלקוח נפתח");
      go(`#/customer/${id}`);
    } catch (err) { toast(err.message, true); }
  });

  /* ---------- order form ---------- */
  let orderCustomer = null, orderId = null;
  $("ofProducts").innerHTML = (window.CHIMNEY_CATALOG || []).map((c) => `<option value="${esc(c.name)}">`).join("");

  function pickCustomer(c) {
    orderCustomer = c;
    const box = $("ofCustomer");
    if (c) {
      box.innerHTML = `<div class="picked"><div><b>${esc(c.name)}</b><div class="hint">${esc([c.phone, c.address].filter(Boolean).join(" · "))}</div></div>
        ${orderId ? "" : '<button class="btn" type="button" id="ofChange">החלף</button>'}</div>`;
      $("ofChange")?.addEventListener("click", () => pickCustomer(null));
      return;
    }
    // results open as a dropdown over the form, so the form never grows past the screen
    box.innerHTML = `<div class="picker">
        <div class="search"><input type="search" id="ofQ" placeholder="חפש לקוח לפי שם או טלפון"></div>
        <a class="btn" href="#/customer-new">➕ חדש</a>
        <div class="list dropdown" id="ofResults"></div>
      </div>`;
    let t;
    $("ofQ").addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = $("ofQ").value.trim();
        if (!q) { $("ofResults").innerHTML = ""; return; }
        try {
          const rows = await crm("list", { filter: "", q });
          $("ofResults").replaceChildren(...rows.slice(0, 6).map((c) => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "item";
            el.innerHTML = `<div class="main"><div class="name">${esc(c.name)}</div><div class="sub">${esc([c.phone, c.address].filter(Boolean).join(" · "))}</div></div>`;
            el.addEventListener("click", () => pickCustomer(c));
            return el;
          }));
          if (!rows.length) $("ofResults").innerHTML = '<div class="hint">לא נמצא – פתח לקוח חדש</div>';
        } catch (e) { toast(e.message, true); }
      }, 250);
    });
  }

  async function orderForm(cid, oid) {
    const live = fresh();
    orderId = oid || null;
    $("of").reset();
    $("ofTitle").textContent = oid ? `הזמנה #${oid}` : "פתיחת הזמנה חדשה";
    pickCustomer(null);
    if (!cid) return;
    try {
      const data = await crm("get", { id: cid });
      if (!live()) return;
      pickCustomer(data.customer);
      const o = oid && data.orders.find((x) => String(x.id) === String(oid));
      if (o) {
        for (const f of ["service", "product", "status", "notes"]) $("of").elements[f].value = o[f] || "";
        $("ofPrice").value = o.price ?? "";
        $("ofDate").value = o.install_date ? String(o.install_date).slice(0, 10) : "";
      } else if (data.customer.service) {
        $("ofService").value = data.customer.service;
      }
    } catch (e) { toast(e.message, true); }
  }
  route("order-new", "order", (cid) => orderForm(cid));
  route("order", "order", (cid, oid) => orderForm(cid, oid));
  $("ofCancel").addEventListener("click", () => history.back());
  $("of").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!orderCustomer) return toast("צריך לבחור לקוח", true);
    const order = { ...Object.fromEntries(new FormData($("of"))), customer_id: orderCustomer.id };
    if (orderId) order.id = orderId;
    try {
      await crm("saveOrder", { order });
      toast(orderId ? "ההזמנה עודכנה" : "ההזמנה נפתחה");
      go(`#/customer/${orderCustomer.id}`);
    } catch (err) { toast(err.message, true); }
  });

  /* ---------- settings ---------- */
  route("settings", "settings", () => {
    const a = agent();
    $("sfName").value = a.name || "";
    $("sfPhone").value = a.phone || "";
    $("sfEmail").value = a.email || "";
  });
  $("sf").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      Studio.setMe(await crm("updateMe", { profile: { name: $("sfName").value, phone: $("sfPhone").value, email: $("sfEmail").value } }));
      toast("הפרטים נשמרו");
      go("#/");
    } catch (err) { toast(err.message, true); }
  });

  Studio.start().then(() => refreshCounts(true));
})();
