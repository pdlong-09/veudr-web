// Smoke test of the web app in headless Edge (Chrome DevTools Protocol, no extra packages).
//   python webapp/serve.py     then     node webapp/test_ui.mjs [screenshot dir]
//   live site: BASE=https://veudr.smlcloud.online/ node webapp/test_ui.mjs   (EDGE_ARGS="--host-resolver-rules=MAP host ip", several args separated by |)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE || "http://127.0.0.1:8765/", CDP = 9334;
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "veudr-shots-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "edge-veudr-"));
const edge = spawn(EDGE, ["--headless=new", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${CDP}`,
  `--user-data-dir=${prof}`, "--window-size=1440,900", ...(process.env.EDGE_ARGS ? process.env.EDGE_ARGS.split("|") : []), "about:blank"]);

let fails = 0;
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) fails++; };
const errors = [];
let ws;
try {
  let target;
  for (let k = 0; k < 50 && !target; k++) {
    try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
    if (!target) await sleep(200);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let n = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" "));
  };
  const cdp = (method, params = {}) => new Promise((r) => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => {
    const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(`${expr}: ${JSON.stringify(r.result.exceptionDetails.exception?.description)}`);
    return r.result.result.value;
  };
  const until = async (expr, ms = 45000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) if (await js(expr).catch(() => false)) return true; return false; };
  const shot = async (name) => {
    const r = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, "base64"));
  };
  const Q = JSON.stringify;
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Page.navigate", { url: BASE + "#/" });

  const t0 = Date.now();
  ok(await until(`S.ready === true && !!map.getLayer("grid") && !!map.getLayer("items-pt") && !!map.getLayer("communes") && !!map.getLayer("lots-fill")`, 60000), "page and data load");
  console.log(`      loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  ok(await js(`!document.getElementById("page-home").hidden && document.querySelector("#page-home h1") !== null && document.querySelectorAll("#nav a").length === 7`), "home page with 7 nav links");
  await sleep(500); await shot("0_home.png");

  // --- map page: basemaps and official lots
  await js(`location.hash = "#/ban-do", true`);
  ok(await until(`S.route === "map" && document.getElementById("page-home").hidden && document.getElementById("panel-map").classList.contains("on")`), "route to map page");
  await js(`setBase("wb", "1049"), true`);
  ok(await js(`map.getLayoutProperty("wb", "visibility") === "visible" && map.getLayoutProperty("sat", "visibility") === "none" && map.getStyle().sources.wb.tiles[0].includes("/1049/")`), "Wayback 01/2021 imagery layer");
  await js(`map.jumpTo({ center: [108.0447, 12.6716], zoom: 14 }), true`);
  ok(await until(`map.loaded() && map.queryRenderedFeatures({ layers: ["lots-hit"] }).length > 0`, 60000), "official lots rendered from the tile directory");
  const lotInfo = await js(`(() => { const f = map.queryRenderedFeatures({ layers: ["lots-hit"] })[0]; openLot(f.properties, map.getCenter()); return f.properties; })()`);
  console.log("     ", Q(lotInfo));
  ok(await js(`document.querySelector("#drawer-body").textContent.includes("tnr.vnforest.gov.vn") && document.querySelector("#drawer h2").textContent.startsWith("TK")`), "lot drawer with source");
  await sleep(2500); await shot("1_map_lots.png");
  await js(`closeDrawer(); setBase("map"); true`);

  // --- list parsing edge cases (no UI)
  ok(await js(`(() => { const r = parseCSV('ma_lo;vi_do;kinh_do\\n"A;1";12,5;108,1\\n'); return r.length === 1 && r[0].ma_lo === "A;1" && num(r[0].vi_do) === 12.5; })()`),
    "CSV with semicolons, quotes and decimal commas");
  ok(await js(`(() => { const r = rowsFromGeoJSON({type:"FeatureCollection",features:[{type:"Feature",properties:{ProductionPlace:"P1",ProducerName:"H"},
      geometry:{type:"Polygon",coordinates:[[[108,12.5],[108.01,12.5],[108.01,12.51],[108,12.51],[108,12.5]]]}}]}); return r[0].id === "P1" && r[0].ho === "H" && Math.abs(r[0].lat - 12.504) < 0.01; })()`),
    "GeoJSON in the EUDR property names");

  // --- sample list
  await js(`location.hash = "#/danh-sach", true`); await sleep(300);
  await js(`document.getElementById("btn-sample").click(), true`);
  ok(await until(`S.list && S.list.plots.length > 500 && !document.getElementById("plots-loaded").hidden && S.route === "plots"`), "sample list loads");
  const L = await js(`(() => { const c = counts(); return { n: S.list.plots.length, skipped: S.list.skipped.length, level: c.level, status: c.status,
      swapped: S.list.plots.some((p) => p.warn.some((w) => w.c === "swap")), dup: S.list.plots.some((p) => p.id === "LO-0010 (2)"),
      big: S.list.plots.some((p) => p.warn.some((w) => w.c === "big")), xa: S.list.plots.filter((p) => p.xaAuto).length,
      match: S.list.plots.filter((p) => p.match).length, sample: S.sampleSet.size,
      off: S.list.plots.filter((p) => p.offc && p.offc[0] + p.offc[1] > 0).length }; })()`);
  console.log("     ", Q(L));
  ok(L.skipped === 1, "row without coordinates is skipped");
  ok(L.swapped && L.dup && L.big, "swapped, duplicate and >4 ha point rows are flagged");
  ok(L.xa >= L.n - 5, "communes assigned automatically");
  ok(L.match >= 570, "study plots matched to their evidence sheets");
  ok(L.off > 0, "plots on official 2020 forest lots are counted");
  ok(L.sample > 0 && L.status.cho_xem === (L.level.cao || 0) + L.sample, "queue = all high plots + spot-check sample");
  ok(await js(`document.querySelectorAll("#table tr[data-plot]").length > 0 && document.getElementById("nav-n").textContent !== ""`), "table and nav counter");
  await sleep(1500); await shot("2_list.png");

  // --- open a high plot on an official forest lot, record a field need
  const id = await js(`(S.list.plots.find((p) => p.level === "cao" && p.match && p.offc && p.offc[0] > 0) || S.list.plots.find((p) => p.level === "cao" && p.match)).id`);
  await js(`flyPlot(${Q(id)}), true`);
  ok(await until(`!document.getElementById("drawer").hidden && document.querySelector("#drawer h2").textContent === ${Q(id)}`), "plot drawer opens");
  ok(await until(`(() => { const i = document.querySelector("#drawer img.sheet"); return !!i && i.complete && i.naturalWidth > 0; })()`), "evidence sheet shown for a matched plot");
  ok(await until(`(() => { const t = document.getElementById("lot-here")?.textContent || ""; return t.includes("Lô rừng 2020") && !t.includes("Đang tìm"); })()`, 60000), "official lot at the plot looked up");
  console.log("      lot-here:", await js(`document.getElementById("lot-here").textContent.replace(/\\s+/g, " ").slice(0, 170)`));
  await js(`document.querySelector('.stbtns button[data-st="can_td"]').click(); document.getElementById("rv-note").value = "Thấy dọn đất 2022"; document.getElementById("rv-by").value = "Kiểm tra viên A"; document.getElementById("rv-save").click(); true`);
  ok(await js(`S.rev[${Q(id)}].status === "can_td" && S.rev[${Q(id)}].history.length === 1`), "review saved");
  ok(await js(`JSON.stringify(store.get(S.list.key)).includes("Thấy dọn đất")`), "review persisted in local storage");
  await sleep(2500); await shot("3_plot.png");

  await js(`(() => { const a = plotById(${Q(id)}); const b = S.list.plots.find((p) => p.id !== a.id && xaOf(p) === xaOf(a)) || S.list.plots.find((p) => p.id !== a.id);
     S.rev[b.id] = { status: "can_td", note: "", by: "", t: Date.now(), history: [] }; saveRev(); refreshAll(); })(), true`);

  // --- field page
  await js(`closeDrawer(); location.hash = "#/thuc-dia"; true`);
  ok(await until(`S.route === "field" && document.querySelectorAll("#field .grp").length >= 1 && document.querySelectorAll("#field ol.stops li").length >= 2`), "field plan grouped by commune");
  ok(await js(`gpx(fieldGroups()).includes("<wpt") && gpx(fieldGroups()).includes(${Q(id)})`), "GPX export has the plots");
  await js(`document.querySelector("#field [data-grp]").click(), true`); await sleep(2500);
  await shot("4_field.png");

  // --- report page
  await js(`location.hash = "#/bao-cao", true`);
  ok(await until(`S.route === "report" && !document.getElementById("page-report").hidden && document.querySelectorAll("#page-report table.rep").length >= 2`), "report page renders");
  ok(await js(`(() => { const c = toCSV(resultRows()); return c.split("\\r\\n").length === S.list.plots.length + 1 && c.includes("Cần thực địa") && c.includes("ban_do_quoc_gia_2020"); })()`), "result CSV");
  ok(await js(`dossierHTML([plotById(${Q(id)})]).includes("Hồ sơ sàng lọc EUDR") && dossierHTML([plotById(${Q(id)})]).includes("Kiểm tra viên A")`), "dossier HTML");
  await sleep(300); await shot("5_report.png");

  // --- method and data pages, browser history
  await js(`location.hash = "#/phuong-phap", true`);
  ok(await until(`S.route === "method" && document.querySelector("#page-method table") !== null`), "method page renders");
  await js(`location.hash = "#/du-lieu", true`);
  ok(await until(`S.route === "data" && document.getElementById("page-data").textContent.includes("tnr.vnforest.gov.vn")`), "data page cites tnr.vnforest.gov.vn");
  await shot("6_data.png");
  await js(`history.back(), true`);
  ok(await until(`S.route === "method"`), "browser back button returns to the previous page");

  // --- English
  const VI_UI = /(Danh sách|Bản đồ|Trang chủ|Mức ưu tiên|Kiểm tra|Thực địa|lô trong|Chờ xem|Ảnh nền|Lớp sàng lọc|Tải lên)/;
  await js(`document.querySelector('.lang [data-lang="en"]').click(), true`);
  ok(await until(`LANG === "en" && document.documentElement.lang === "en" && location.search.includes("lang=en") && document.querySelector('#nav a[data-route="home"]').textContent.trim() === "Home"`), "switch to English");
  await js(`location.hash = "#/"; true`);
  ok(await until(`document.querySelector("#page-home h1").textContent.startsWith("Know which plots")`), "home page in English");
  ok(!VI_UI.test(await js(`document.getElementById("page-home").innerText + " " + document.querySelector(".topbar").innerText`)), "no Vietnamese UI text left on the home page");
  await js(`location.hash = "#/ban-do"; true`);
  ok(await until(`S.route === "map" && document.getElementById("legend").textContent.includes("Tree-cover loss after 2020")`), "map legend in English");
  ok(!VI_UI.test(await js(`document.getElementById("panel-map").innerText`)), "no Vietnamese UI text left in the map panel");
  await js(`location.hash = "#/danh-sach"; true`);
  ok(await until(`document.getElementById("funnel").textContent.includes("plots in the list") && document.querySelector("#table th").textContent === "Plot"`), "plot list in English");
  ok(!VI_UI.test(await js(`document.getElementById("panel-plots").innerText`)), "no Vietnamese UI text left in the list panel");
  await js(`flyPlot(${Q(id)}), true`);
  ok(await until(`document.getElementById("drawer-body").textContent.includes("Step 1 · Check the imagery") && document.getElementById("drawer-body").textContent.includes("Field visit needed")`), "plot dossier in English");
  const lotEn = await until(`(() => { const t = document.getElementById("lot-here")?.textContent || ""; return t.includes("2020 forest lot at this place") && !t.includes("Looking up"); })()`, 60000);
  if (!lotEn) console.log("      debug:", Q(await js(`({ lot: (document.getElementById("lot-here")?.textContent || "none").slice(0, 120), z: map.getZoom(), route: S.route,
    hit: map.getLayer("lots-hit") ? map.queryRenderedFeatures({ layers: ["lots-hit"] }).length : -1, center: map.getCenter(), drawer: !document.getElementById("drawer").hidden })`)));
  ok(lotEn, "official lot lookup in English");
  ok(await js(`toCSV(resultRows()).startsWith("plot_id,farmer,commune")`), "CSV headers in English");
  ok(await js(`dossierHTML([plotById(${Q(id)})]).includes("EUDR screening dossier")`), "dossier in English");
  await js(`closeDrawer(); location.hash = "#/bao-cao"; true`);
  ok(await until(`document.querySelector("#page-report h1").textContent.startsWith("Report")`), "report page in English");
  await js(`location.hash = "#/phuong-phap"; true`);
  ok(await until(`document.querySelector("#page-method h1").textContent === "Method"`) && !VI_UI.test(await js(`document.getElementById("page-method").innerText`)), "method page in English");
  await shot("7_english.png");
  await js(`document.querySelector('.lang [data-lang="vi"]').click(), true`);
  ok(await until(`LANG === "vi" && document.querySelector("#page-method h1").textContent === "Phương pháp" && document.querySelector('#nav a[data-route="home"]').textContent.trim() === "Trang chủ"`), "switch back to Vietnamese");

  // --- reload resumes the list and the review
  await js(`location.hash = "#/danh-sach", true`);
  await js(`window.__oldPage = true`);  // the old page also has a (hidden) resume button: wait for the new one
  await cdp("Page.reload");
  await cdp("Page.bringToFront");
  const resumed = await until(`!window.__oldPage && S.ready === true && document.getElementById("btn-resume") !== null`);
  if (!resumed) console.log("      debug:", Q(await js(`({ ready: S.ready, route: S.route, hash: location.hash, last: (localStorage.getItem("veudr:last") || "").length,
    resume: document.getElementById("resume").innerHTML.slice(0, 80), emptyHidden: document.getElementById("plots-empty").hidden,
    fatal: document.querySelector(".fatal")?.textContent || "", loaded: map.loaded(), style: map.isStyleLoaded() })`).catch((e) => e.message)), Q(errors));
  if (!resumed) console.log("      debug2:", Q(await js(`Promise.race([fetch("https://tiles.openfreemap.org/styles/positron", {cache: "no-store"}).then((r) => "style " + r.status), new Promise((r) => setTimeout(() => r("style fetch timeout"), 8000))])`).catch((e) => e.message)),
    Q(await js(`Promise.race([fetch("data/meta.json", {cache: "no-store"}).then((r) => "meta " + r.status), new Promise((r) => setTimeout(() => r("meta timeout"), 8000))])`).catch((e) => e.message)),
    Q(await js(`performance.getEntriesByType("resource").map((e) => e.name.slice(-50) + " " + Math.round(e.duration)).slice(0, 12)`).catch((e) => e.message)));
  if (!resumed) console.log("      debug3:", Q(await js(`({ vis: document.visibilityState, styleLoaded: !!(map.style && map.style._loaded), layers: map.style ? Object.keys(map.style._layers || {}).length : -1,
    canvas: map.getCanvas().width + "x" + map.getCanvas().height, gl: !!map.painter?.context?.gl, lost: map.painter?.context?.gl?.isContextLost?.(),
    sources: map.style ? Object.entries(map.style.sourceCaches || {}).map(([k, c]) => k + ":" + c.loaded()) : [], images: map.style?.imageManager?.isLoaded?.(),
    res: performance.getEntriesByType("resource").filter((e) => /openfreemap|sprite|glyph|font/.test(e.name)).map((e) => e.name.slice(-40) + " " + Math.round(e.duration)) })`).catch((e) => e.message)));
  ok(resumed, "resume offered after reload");
  await js(`document.getElementById("btn-resume").click(), true`);
  ok(await until(`S.list && S.rev[${Q(id)}] && S.rev[${Q(id)}].status === "can_td"`), "review restored after reload");

  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await js(`location.hash = "#/"; true`); await sleep(800);
  ok(await js(`document.documentElement.scrollWidth <= window.innerWidth && document.getElementById("page-home").scrollWidth <= window.innerWidth`), "no horizontal scroll on phone (home)");
  await shot("8_mobile_home.png");
  await js(`location.hash = "#/danh-sach"; true`); await sleep(1200);
  ok(await js(`document.getElementById("side").scrollWidth <= document.getElementById("side").clientWidth + 1`), "no horizontal scroll on phone (list)");
  await shot("9_mobile_list.png");

  ok(errors.length === 0, `no page errors ${errors.length ? Q(errors.slice(0, 5)) : ""}`);
} catch (e) {
  console.log("FAIL exception:", e.message); fails++;
} finally {
  try { ws?.send(JSON.stringify({ id: 99999, method: "Browser.close" })); } catch { /* closed */ }
  await sleep(500);
  edge.kill();
  console.log(`screenshots in ${SHOTS}`);
  console.log(fails ? `${fails} FAILED` : "all ok");
  process.exit(fails ? 1 : 0);
}
