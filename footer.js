// Site footer, shared by every page: put <footer id="site-footer"></footer> and this script at the end of <body>.
// Business details live here, so they only need changing in one place.
(() => {
  const BIZ = {
    phone: "(555) 555-0123", tel: "+15555550123", email: "info@thechemineys.com",
    area: "Your city and all surrounding suburbs",
    hours: [["Mon – Fri", "7:00 am – 8:00 pm"], ["Sat", "8:00 am – 6:00 pm"], ["Sun", "By appointment"]]
  };
  const LINKS = [
    ["Home", "index.html"],
    ["New chimney installation", "index.html#install"],
    ["Chimney cleaning", "index.html#clean"],
    ["Chimney replacement", "index.html#replace"],
    ["Our work gallery", "gallery.html"],
    ["Free estimate", "lead.html"]
  ];
  const el = document.getElementById("site-footer");
  if (!el) return;
  el.className = "site-footer";
  el.innerHTML = `
    <div class="sf-grid">
      <section>
        <a class="sf-brand" href="index.html"><i>&#9733;</i>THECHEMINEYS</a>
        <h3>Serving area</h3>
        <p class="sf-area">${BIZ.area}</p>
      </section>
      <section class="sf-contact">
        <h3>Contact us</h3>
        <p><a class="sf-phone" href="tel:${BIZ.tel}">${BIZ.phone}</a><br><a href="mailto:${BIZ.email}">${BIZ.email}</a></p>
        <a class="sf-btn" href="lead.html">Send a message</a>
      </section>
      <section>
        <h3>Business hours</h3>
        <dl class="sf-hours">${BIZ.hours.map(([d, h]) => `<dt>${d}</dt><dd>${h}</dd>`).join("")}</dl>
        <p>Contact us for an appointment!</p>
      </section>
      <nav class="sf-links" aria-label="Footer">
        <h3>Links</h3>
        <ul>${LINKS.map(([t, href]) => `<li><a href="${href}">${t}</a></li>`).join("")}</ul>
      </nav>
    </div>
    <div class="sf-bottom">&copy; ${new Date().getFullYear()} THECHEMINEYS<span>&#9733;</span>Licensed &amp; Insured<span>&#9733;</span>Family Owned</div>`;
})();
