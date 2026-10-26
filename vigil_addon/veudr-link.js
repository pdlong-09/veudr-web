/* vEUDR link in the vigil.green header. Injected by nginx (sub_filter in /etc/nginx/sites-available/vigil), so the
   vigil app and its image are unchanged. To remove: delete the lines marked "vEUDR" in that file, reload nginx,
   and delete /var/www/vigil-addon/. */
(function () {
  var TARGET = "https://veudr.smlcloud.online/";
  function make(like) {
    var a = document.createElement("a");
    a.href = TARGET; a.target = "_blank"; a.rel = "noopener";
    a.setAttribute("data-veudr", "1");
    a.title = "vEUDR: sàng lọc EUDR cho lô cà phê Tây Nguyên / EUDR screening for coffee plots";
    a.className = like.className;
    a.appendChild(document.createTextNode("vEUDR"));
    var s = document.createElement("span");
    s.setAttribute("aria-hidden", "true"); s.textContent = " \u2197"; s.style.fontSize = "0.8em"; s.style.opacity = "0.8";
    a.appendChild(s);
    return a;
  }
  function add() {
    var header = document.querySelector("header"); if (!header) return;
    var contacts = header.querySelectorAll('a[href="/contact"]');   // the last item, in the desktop bar and in the mobile menu
    for (var i = 0; i < contacts.length; i++) {
      var c = contacts[i], box = c.parentNode;
      if (box.querySelector("[data-veudr]")) continue;
      var links = box.querySelectorAll('a[href^="/"]'), like = c;  // copy the look of an item that is not the current page
      for (var j = 0; j < links.length; j++) if (links[j].getAttribute("href") !== location.pathname) { like = links[j]; break; }
      box.insertBefore(make(like), c.nextSibling);
    }
  }
  function start() {
    add();
    var t; new MutationObserver(function () { clearTimeout(t); t = setTimeout(add, 50); }).observe(document.body, { childList: true, subtree: true });
  }
  // start as soon as React has hydrated the header (it tags hydrated nodes with __reactFiber...), so the extra item
  // never disturbs hydration; no waiting for the page's images
  function hydrated() {
    var c = document.querySelector('header a[href="/contact"]');
    if (!c) return false;
    for (var k in c) if (k.indexOf("__reactFiber") === 0 || k.indexOf("__reactProps") === 0) return true;
    return false;
  }
  // hydration of the header's parent can still be finishing when its last link is tagged: wait a moment more and for
  // an idle main thread before touching the header
  function later() {
    setTimeout(function () {
      if (window.requestIdleCallback) requestIdleCallback(start, { timeout: 3000 }); else setTimeout(start, 500);
    }, 1000);
  }
  var tries = 0;
  (function wait() { if (hydrated() || ++tries > 100) later(); else setTimeout(wait, 150); })();
})();
