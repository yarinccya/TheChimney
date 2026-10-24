// Sales agents' screens: home, leads, call-backs, customer card, customer and order forms, settings.
(() => {
  const { $, crm, go, route, toast, esc, waNumber, fmtDate, ago, localInput, agent, store } = Studio;

  const STATUS = { new: "ליד חדש", follow_up: "לחזור", customer: "לקוח", closed: "לא רלוונטי" };
  const ORDER_STATUS = { new: "חדשה", confirmed: "אושרה", scheduled: "נקבעה התקנה", done: "בוצעה", cancelled: "בוטלה" };
  const SOURCE = { phone: "טלפון", website: "אתר", referral: "המלצה", social: "רשתות חברתיות", field: "שטח", other: "אחר" };
  const PHONE_ICON = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>';

  // Each screen render bumps this; a slow response for an old screen is dropped.
  let seq = 0;
  const fresh = () => { const n = ++seq; return () => n === seq; };

  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const money = (v) => v == null ? "" : `₪${Number(v).toLocaleString("he-IL")}`;

  /* ---------- home ---------- */
  route("home", "home", async () => {
    const live = fresh();
    const name = agent().name;
    const h = new Date().getHours();
    $("hello").textContent = `${h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב"}${name ? ", " + name : ""}`;
    $("today").textContent = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
    $("homeQ").value = "";
    try {
      const s = await crm("stats");
      if (!live()) return;
      $("bLeads").textContent = s.leads || "";
      $("bCallbacks").textContent = s.callbacks_due || "";
      $("sCallbacks").textContent = s.callbacks ? `${s.callbacks} ברשימה${s.callbacks_due ? ` · ${s.callbacks_due} להיום` : ""}` : "";
      $("tCallbacks").classList.toggle("hot", s.callbacks_due > 0);
    } catch (e) {
      if (live()) toast(e.message, true);
    }
  });
  $("homeSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("homeQ").value.trim();
    go(`#/customers/${encodeURIComponent(q)}`);
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
    try {
      const rows = await crm("list", { filter, q });
      if (!live()) return;
      $("listCount").textContent = rows.length ? `${rows.length}` : "";
      $("listBody").replaceChildren(...rows.map((c) => item(c, filter)));
      if (!rows.length) {
        $("listBody").innerHTML = `<div class="none">${q ? "לא נמצאו לקוחות" : filter === "leads" ? "אין לידים ממתינים 🎉" : filter === "callbacks" ? "אין לקוחות לחזור אליהם" : "אין לקוחות עדיין"}</div>`;
      }
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

  route("customer", "customer", async (id) => {
    const live = fresh();
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

  function renderCustomer() {
    const { customer: c, orders, activity } = current;
    const followUp = c.status === "follow_up" && c.follow_up_at ? ` · ${fmtDate(c.follow_up_at)}` : "";
    const facts = [
      ["טלפון", c.phone], ["אימייל", c.email], ["כתובת", c.address], ["שירות", c.service],
      ["מקור", SOURCE[c.source] || c.source], ["נפתח", `${fmtDate(c.created_at)}${c.agent ? ` ע״י ${c.agent}` : ""}`],
    ].filter(([, v]) => v);

    $("custBody").innerHTML = `
      <div class="vhead"><h2>${esc(c.name)}</h2><span class="pill ${c.status}">${STATUS[c.status] || c.status}${esc(followUp)}</span></div>
      <div class="facts">${facts.map(([k, v]) => `<div>${k}: <b>${esc(v)}</b></div>`).join("")}</div>
      ${c.notes ? `<p class="hint" style="white-space:pre-wrap">${esc(c.notes)}</p>` : ""}
      <div class="quick" style="margin-top:.6rem">
        <a class="btn green" href="tel:${esc(c.phone)}">📞 התקשר</a>
        <a class="btn" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener">💬 וואטסאפ</a>
        <a class="btn" href="#/customer-edit/${c.id}">✏️ עריכה</a>
      </div>
      <div class="quick">
        <button class="btn" type="button" id="cFollow">⏰ לחזור אליו</button>
        <button class="btn" type="button" id="cWon">✅ לקוח</button>
        <button class="btn" type="button" id="cLost">✖ לא רלוונטי</button>
      </div>
      <a class="btn primary" href="#/order-new/${c.id}" style="margin-top:.2rem">🧾 הזמנה חדשה ללקוח</a>

      <div class="sec">הזמנות (${orders.length})</div>
      <div class="list orders" style="display:grid">${orders.map((o) => `
        <a class="item" href="#/order/${c.id}/${o.id}">
          <div class="main"><div class="name">#${o.id} · ${esc(o.service || o.product)}</div>
          <div class="sub">${esc([o.product, money(o.price), o.install_date ? `התקנה ${fmtDate(o.install_date, false)}` : ""].filter(Boolean).join(" · "))}</div></div>
          <span class="pill">${ORDER_STATUS[o.status] || o.status}</span>
        </a>`).join("") || '<div class="hint">אין הזמנות עדיין</div>'}</div>

      <div class="sec">תיעוד שיחות והערות</div>
      <form class="addnote" id="noteForm">
        <input class="field" id="noteText" placeholder="מה היה בשיחה?">
        <button class="btn primary" type="submit">הוסף</button>
      </form>
      <div class="timeline">${activity.map((a) => `<div>${esc(a.text)}<small>${fmtDate(a.created_at)}${a.agent ? ` · ${esc(a.agent)}` : ""}</small></div>`).join("")}</div>`;

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
    box.innerHTML = `<div class="search"><input type="search" id="ofQ" placeholder="חפש לקוח לפי שם או טלפון"></div>
      <div class="list" id="ofResults" style="display:grid;margin-top:.4rem"></div>
      <a class="btn" href="#/customer-new" style="margin-top:.4rem">➕ לקוח חדש</a>`;
    let t;
    $("ofQ").addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = $("ofQ").value.trim();
        if (!q) { $("ofResults").innerHTML = ""; return; }
        try {
          const rows = await crm("list", { filter: "", q });
          $("ofResults").replaceChildren(...rows.slice(0, 8).map((c) => {
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
    $("sfFirst").hidden = !!a.name;
    $("sfName").value = a.name || "";
    $("sfPhone").value = a.phone || "";
    $("sfEmail").value = a.email || "";
  });
  $("sf").addEventListener("submit", (e) => {
    e.preventDefault();
    store.set("studioAgent", JSON.stringify({ name: $("sfName").value.trim(), phone: $("sfPhone").value.trim(), email: $("sfEmail").value.trim() }));
    toast("הפרטים נשמרו");
    go("#/");
  });
  $("sfLogout").addEventListener("click", () => $("logout").click());

  Studio.render();
})();
