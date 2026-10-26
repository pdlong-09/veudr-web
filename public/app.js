/* vEUDR: screening of a company's plot list for EUDR checks. Static multi-page app (hash routes), Vietnamese and
   English; data from build_data.py (grid.png, items.geojson, communes.geojson, meta.json) and build_lots.py
   (data/lots/{z}/{x}/{y}.pbf). Uploaded lists never leave the browser. */
"use strict";

// ------------------------------------------------------------------ basics
const R = 6378137;
const HA_PER_POINT = 25;
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

// ------------------------------------------------------------------ language
// ?lang=en|vi in the address wins, then the last choice in this browser, then Vietnamese
let LANG = (() => { const q = new URLSearchParams(location.search).get("lang"); return q === "en" || q === "vi" ? q : store.get("veudr:lang") === "en" ? "en" : "vi"; })();
const tx = (vi, en) => (LANG === "en" ? en : vi);
const loc = () => (LANG === "en" ? "en-GB" : "vi-VN");
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? "–" : n.toLocaleString(loc(), { maximumFractionDigits: d, minimumFractionDigits: d }));
const pct = (x) => (x == null || Number.isNaN(x) ? "–" : fmt(100 * x, 0) + "%");
const dt = (t) => new Date(t).toLocaleString(loc());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PROV_CODE = [null, "Đắk Lắk", "Đắk Nông", "Gia Lai", "Kon Tum", "Lâm Đồng"];
const PROV_VI = { "Dak Lak": "Đắk Lắk", "Dak Nong": "Đắk Nông", "Gia Lai": "Gia Lai", "Kon Tum": "Kon Tum", "Lam Dong": "Lâm Đồng" };
const STATUS_ORDER = ["cho_xem", "can_td", "van_de", "ok_anh", "ok_td", "khong_can", "ngoai"];
const AGREE = ["#efe9dc", "#c7e3b0", "#8cc47a", "#4a9a4f", "#1c6b35"];
const LOSS = { 21: "#fed976", 22: "#feb24c", 23: "#fd8d3c", 24: "#f03b20", 25: "#bd0026" };
const WAYBACK = [["2016-01-13", "3515"], ["2017-01-11", "577"], ["2018-01-08", "13161"], ["2019-01-09", "6036"], ["2020-01-08", "23001"],
  ["2021-01-13", "1049"], ["2022-01-12", "42663"], ["2023-01-11", "11475"], ["2024-01-18", "41468"], ["2025-01-30", "36557"],
  ["2026-01-29", "22252"], ["2026-09-24", "63116"]];

// labels in the current language (colours and keys never change); rebuilt by setLang
let SRC_VNF, TIER, LEVEL, REASON, STATUS, V1V4, OFFC, LOT_CLS, LOT_QH, LDLR, MDSD, VERDICT, VNAME, CHANGE, LANDUSE, SOURCE, CONF, MAPS, TITLES;
function defineTexts() {
  SRC_VNF = tx("Bản đồ diễn biến rừng năm 2020, tnr.vnforest.gov.vn", "2020 forest-status map, tnr.vnforest.gov.vn");
  // grid tiers (one 500 m sample point); same rule as build_data.tier
  TIER = {
    3: { name: tx("Cao", "High"), color: "#e34a33", text: tx("Có mất tán cây sau 2020 ở nơi ít nhất một bản đồ (kể cả bản đồ hiện trạng rừng quốc gia) gọi là rừng năm 2020",
      "Tree-cover loss after 2020 where at least one map (the national forest-status map included) calls the land forest in 2020") },
    2: { name: tx("Trung bình", "Medium"), color: "#f39c12", text: tx("Các bản đồ không thống nhất về rừng năm 2020, hoặc GFC2020 V1 và V4 khác nhau",
      "The maps disagree on forest in 2020, or GFC2020 V1 and V4 differ") },
    1: { name: tx("Thấp", "Low"), color: "#cfc8b8", text: tx("Không bản đồ nào gọi là rừng năm 2020 và không có mất tán sau 2020",
      "No map calls it forest in 2020 and there is no tree-cover loss after 2020") },
    0: { name: tx("Rừng ổn định", "Stable forest"), color: "#1c6b35", text: tx("Mọi bản đồ gọi là rừng, không có mất tán. Lô cà phê khai báo ở đây xếp mức Trung bình",
      "Every map calls it forest and there is no loss. A coffee plot declared here is ranked Medium") },
  };
  LEVEL = {
    cao: { name: tx("Cao", "High"), color: "#e34a33", order: 0 },
    tb: { name: tx("Trung bình", "Medium"), color: "#f39c12", order: 1 },
    thap: { name: tx("Thấp", "Low"), color: "#8a8270", order: 2 },
    ngoai: { name: tx("Ngoài vùng", "Outside the area"), color: "#9aa0a6", order: 3 },
  };
  REASON = {
    cao: tx("Có mất tán cây sau 2020 ở nơi ít nhất một bản đồ gọi là rừng năm 2020. Cần xem ảnh trước và sau 31/12/2020.",
      "Tree-cover loss after 2020 where at least one map calls the land forest in 2020. Check the imagery before and after 31/12/2020."),
    tb: tx("Các bản đồ không thống nhất về rừng năm 2020, nhưng không thấy mất tán sau 2020.",
      "The maps disagree on forest in 2020, but no tree-cover loss is seen after 2020."),
    tb_forest: tx("Mọi bản đồ gọi là rừng năm 2020 và không có mất tán: lô cà phê ở đây cần kiểm tra lại ranh giới hoặc hiện trạng.",
      "Every map calls it forest in 2020 and there is no loss: a coffee plot here needs its outline or land use checked again."),
    thap: tx("Không bản đồ nào gọi là rừng năm 2020 và không có mất tán sau 2020.", "No map calls it forest in 2020 and there is no tree-cover loss after 2020."),
    ngoai: tx("Lô nằm ngoài vùng có dữ liệu (5 tỉnh Tây Nguyên trước sáp nhập), chưa sàng lọc được.",
      "The plot is outside the area with data (the 5 Central Highlands provinces before the 2025 merger) and could not be screened."),
    exact: tx(" Tính trên đúng ranh giới lô nghiên cứu trùng vị trí.", " Measured on the outline of the study plot at the same place."),
  };
  STATUS = {
    cho_xem: { name: tx("Chờ xem ảnh", "Awaiting image check"), color: "#f39c12" },
    khong_can: { name: tx("Không cần xem", "No check needed"), color: "#c9c4b8" },
    ok_anh: { name: tx("Xem ảnh: ổn", "Imagery: fine"), color: "#2166ac" },
    can_td: { name: tx("Cần thực địa", "Field visit needed"), color: "#e34a33" },
    ok_td: { name: tx("Thực địa: ổn", "Field visit: fine"), color: "#1c6b35" },
    van_de: { name: tx("Có vấn đề", "Problem found"), color: "#111111" },
    ngoai: { name: tx("Chưa sàng lọc", "Not screened"), color: "#9aa0a6" },
  };
  V1V4 = { both: ["#1c6b35", tx("V1 và V4 đều gọi là rừng", "Both V1 and V4 call it forest")], v1: ["#e6550d", tx("Chỉ V1 gọi là rừng (V4 đã bỏ)", "Only V1 calls it forest (dropped in V4)")],
    v4: ["#3182bd", tx("Chỉ V4 gọi là rừng", "Only V4 calls it forest")], none: ["#efe9dc", tx("Không phiên bản nào gọi là rừng", "Neither version calls it forest")] };
  OFFC = { 1: ["#1b5e20", tx("Rừng tự nhiên", "Natural forest")], 2: ["#8bc34a", tx("Rừng trồng", "Plantation forest")],
    3: ["#e8d9a8", tx("Chưa có rừng (trong lô lâm nghiệp)", "Not forest (inside a forestry lot)")] };
  LOT_CLS = { n: ["#2e7d32", tx("Rừng tự nhiên", "Natural forest")], p: ["#9ccc65", tx("Rừng trồng", "Plantation forest")], x: ["#e2cf8f", tx("Chưa có rừng / đất khác", "Not forest / other land")] };
  // malr3 (checked against mdsd): 1 = phòng hộ (PHDN, PHMT, PHMS), 2 = đặc dụng (VQG, BTTN, NCKH, VHCQ), 3 = sản xuất
  LOT_QH = { 2: ["#7b1fa2", tx("Đặc dụng", "Special-use")], 1: ["#1565c0", tx("Phòng hộ", "Protection")], 3: ["#ef6c00", tx("Sản xuất", "Production")],
    0: ["#9e9e9e", tx("Ngoài quy hoạch lâm nghiệp", "Outside forestry planning")], [-1]: ["#bdbdbd", tx("Không rõ", "Unknown")] };
  LDLR = LANG === "en" ? {
    TXG: "rich evergreen broadleaf natural forest", TXB: "medium evergreen broadleaf natural forest", TXN: "poor evergreen broadleaf natural forest",
    TXK: "very poor evergreen broadleaf natural forest", TXP: "regrowth evergreen broadleaf natural forest", RLG: "rich dry dipterocarp (deciduous) forest",
    RLB: "medium dry dipterocarp (deciduous) forest", RLN: "poor dry dipterocarp (deciduous) forest", RLK: "very poor dry dipterocarp (deciduous) forest",
    RLP: "regrowth dry dipterocarp (deciduous) forest", LKG: "rich natural coniferous forest", LKB: "medium natural coniferous forest",
    LKN: "poor natural coniferous forest", LKP: "regrowth natural coniferous forest", HG1: "mixed timber and bamboo forest (mostly timber)",
    HG2: "mixed bamboo and timber forest (mostly bamboo)", TNK: "bamboo forest", LOO: "Schizostachyum (lồ ô) bamboo forest", RTG: "timber plantation",
    RTK: "other plantation (multi-purpose trees: rubber, cashew, specialty crops…)", DTR: "planted land not yet forest",
    DT1: "bare land with regenerating trees", DT2: "bare land without regenerating trees", DNN: "agricultural land (inside a forestry lot)",
    DK: "other land", MN: "water" } : {
    TXG: "rừng gỗ tự nhiên thường xanh giàu", TXB: "rừng gỗ tự nhiên thường xanh trung bình", TXN: "rừng gỗ tự nhiên thường xanh nghèo",
    TXK: "rừng gỗ tự nhiên thường xanh nghèo kiệt", TXP: "rừng gỗ tự nhiên thường xanh phục hồi", RLG: "rừng khộp (lá rộng rụng lá) giàu",
    RLB: "rừng khộp (lá rộng rụng lá) trung bình", RLN: "rừng khộp (lá rộng rụng lá) nghèo", RLK: "rừng khộp (lá rộng rụng lá) nghèo kiệt",
    RLP: "rừng khộp (lá rộng rụng lá) phục hồi", LKG: "rừng lá kim tự nhiên giàu", LKB: "rừng lá kim tự nhiên trung bình",
    LKN: "rừng lá kim tự nhiên nghèo", LKP: "rừng lá kim tự nhiên phục hồi", HG1: "rừng hỗn giao gỗ – tre nứa (gỗ là chính)",
    HG2: "rừng hỗn giao tre nứa – gỗ (tre nứa là chính)", TNK: "rừng tre nứa", LOO: "rừng lồ ô", RTG: "rừng trồng gỗ",
    RTK: "rừng trồng khác (cây đa mục đích: cao su, điều, đặc sản…)", DTR: "đất đã trồng rừng nhưng chưa thành rừng",
    DT1: "đất trống có cây gỗ tái sinh", DT2: "đất trống không có cây gỗ tái sinh", DNN: "đất nông nghiệp (trong phạm vi lô lâm nghiệp)",
    DK: "đất khác", MN: "mặt nước" };
  MDSD = LANG === "en" ? { VQG: "national park", BTTN: "nature reserve", PHDN: "watershed protection", PHMT: "environmental protection",
    NCKH: "scientific research", MDK: "other purpose" } : { VQG: "vườn quốc gia", BTTN: "khu bảo tồn thiên nhiên", PHDN: "phòng hộ đầu nguồn",
    PHMT: "phòng hộ môi trường", NCKH: "nghiên cứu khoa học", MDK: "mục đích khác" };
  VERDICT = { compliant: ["#2166ac", tx("Tuân thủ", "Compliant")], non_compliant: ["#b2182b", tx("Không tuân thủ", "Non-compliant")],
    undetermined: ["#7b3294", tx("Chưa xác định", "Undetermined")], nolabel: ["#636363", tx("Chưa có nhãn", "No label")] };
  VNAME = { compliant: tx("Tuân thủ", "Compliant"), non_compliant: tx("Không tuân thủ", "Non-compliant"), undetermined: tx("Chưa xác định", "Undetermined"),
    disputed: tx("Đang tranh chấp", "Disputed") };
  CHANGE = { cleared_no_use_yet: tx("Đã dọn, chưa thấy sử dụng", "Cleared, no use seen yet"),
    other_not_a_conversion: tx("Thay đổi khác, không chuyển đổi (cháy, khai thác chọn, hạ tầng…)", "Other change, not a conversion (fire, selective logging, infrastructure…)"),
    conversion_to_agriculture: tx("Chuyển sang nông nghiệp", "Conversion to agriculture"),
    plantation_harvested_and_replanted: tx("Rừng trồng khai thác và trồng lại", "Plantation harvested and replanted"), no_change: tx("Không thay đổi", "No change") };
  LANDUSE = { natural_forest: tx("Rừng tự nhiên", "Natural forest"), coffee_or_agroforestry: tx("Cà phê / nông lâm kết hợp", "Coffee / agroforestry"),
    wood_plantation: tx("Rừng trồng gỗ", "Wood plantation"), annual_crop_or_bare: tx("Cây hằng năm / đất trống", "Annual crop / bare land"),
    other_perennial_crop: tx("Cây lâu năm khác", "Other perennial crop"), unclear: tx("Không rõ", "Unclear") };
  SOURCE = { person: tx("người gán nhãn", "a person"), model: tx("mô hình (Claude Opus 5.5)", "a model (Claude Opus 5.5)"), person_and_model: tx("người và mô hình", "a person and a model") };
  CONF = { high: tx("cao", "high"), medium: tx("trung bình", "medium"), low: tx("thấp", "low") };
  MAPS = [["gfcV1", tx("GFC2020 phiên bản 1", "GFC2020 version 1")], ["gfcV4", tx("GFC2020 phiên bản 4", "GFC2020 version 4")],
    ["tmf", tx("JRC TMF (rừng ẩm nhiệt đới)", "JRC TMF (tropical moist forest)")], ["han", tx("Hansen (độ che phủ ≥ 30%)", "Hansen (tree cover ≥ 30%)")],
    ["wc", tx("ESA WorldCover (cây gỗ)", "ESA WorldCover (tree cover)")], ["off", tx("Bản đồ hiện trạng rừng 2020 (quốc gia)", "2020 forest-status map (national)")]];
  TITLES = { home: tx("Trang chủ", "Home"), map: tx("Bản đồ", "Map"), plots: tx("Danh sách lô", "Plot list"), field: tx("Thực địa", "Field visits"),
    report: tx("Báo cáo", "Report"), method: tx("Phương pháp", "Method"), data: tx("Dữ liệu", "Data") };
}
defineTexts();
// plot warnings and skipped rows are stored as codes, so a loaded list follows a change of language
function warnText(w) {
  switch (w.c) {
    case "swap": return tx("Vĩ độ và kinh độ bị đảo, đã tự sửa", "Latitude and longitude were swapped; corrected");
    case "noid": return tx("Thiếu mã lô, đã đặt mã theo số dòng", "No plot code; named after the row number");
    case "dupid": return tx(`Trùng mã lô ${w.a}`, `Duplicate plot code ${w.a}`);
    case "dupid2": return tx("Trùng mã lô với một dòng khác", "Plot code also used on another row");
    case "dupxy": return tx(`Trùng tọa độ với lô ${w.a}`, `Same coordinates as plot ${w.a}`);
    case "big": return tx("Lô trên 4 ha nhưng chỉ có tọa độ điểm: EUDR yêu cầu ranh giới đa giác", "Plot over 4 ha given as a point only: the EUDR requires a polygon");
    case "outvn": return tx("Tọa độ nằm ngoài Việt Nam", "Coordinates outside Vietnam");
    case "coords": return tx("Thiếu hoặc sai tọa độ", "Missing or invalid coordinates");
    default: return String(w.c);
  }
}
const reasonOf = (p) => REASON[p.reasonKey] + (p.exact ? REASON.exact : "");

const S = { meta: null, grid: null, mode: "tier", items: null, communes: null, list: null, rev: {}, rate: 0.05, route: "home",
  base: "map", wb: "1049", lotsBy: "cls", ready: false, sampleSet: new Set(), open: null };

function hash32(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function km(a, b) {  // haversine, [lon, lat]
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// ------------------------------------------------------------------ map
const map = new maplibregl.Map({
  container: "map", style: "https://tiles.openfreemap.org/styles/positron",
  center: [108.1, 13.3], zoom: 7, maxZoom: 19, attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
map.on("error", (e) => {  // lot tiles exist only where there are lots: a missing tile is a 404, not an error
  if (e.error?.status === 404 && /\/data\/lots\//.test(e.error.url || "")) return;
  console.error(e.error || e);
});
class BaseControl {  // quick switch on the map itself
  onAdd() {
    this.el = document.createElement("div");
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-group basectl";
    this.el.innerHTML = `<button data-base="map"></button><button data-base="sat"></button><button data-base="wb"></button>`;
    this.el.onclick = (e) => { const b = e.target.closest("[data-base]"); if (b) setBase(b.dataset.base); };
    return this.el;
  }
  onRemove() { this.el.remove(); }
}
map.addControl(new BaseControl(), "top-left");
function renderBaseControl() {
  const b = (k) => document.querySelector(`.basectl [data-base="${k}"]`);
  if (!b("map")) return;
  b("map").textContent = tx("Bản đồ", "Map"); b("map").title = tx("Bản đồ", "Map");
  b("sat").textContent = tx("Vệ tinh", "Satellite"); b("sat").title = tx("Ảnh vệ tinh mới nhất", "Latest satellite imagery");
  b("wb").textContent = S.base === "wb" ? wbLabel(S.wb) : tx("Theo năm", "By year"); b("wb").title = tx("Ảnh vệ tinh theo năm (Esri Wayback)", "Satellite imagery by year (Esri Wayback)");
}
let LABELS;  // first symbol layer of the base style: area overlays go below it so place names stay readable
const wbTiles = (id) => [`https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${id}/{z}/{y}/{x}`];
// "style.load", not "load": "load" waits for the first rendered frame, which never comes while the tab is in the background
const styleReady = new Promise((ok) => (map.isStyleLoaded() ? ok() : map.once("style.load", ok)));
styleReady.then(() => {
  LABELS = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addSource("sat", { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Esri, Maxar, Earthstar Geographics",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] });
  map.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } }, LABELS);
  map.addSource("wb", { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Esri World Imagery Wayback", tiles: wbTiles(S.wb) });
  map.addLayer({ id: "wb", type: "raster", source: "wb", layout: { visibility: "none" } }, LABELS);
});
function setBase(b, wb) {
  S.base = b;
  if (wb && wb !== S.wb) {
    S.wb = wb; $("#wb-year").value = wb;
    if (map.getSource("wb")) { map.removeLayer("wb"); map.removeSource("wb");
      map.addSource("wb", { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Esri World Imagery Wayback", tiles: wbTiles(wb) });
      map.addLayer({ id: "wb", type: "raster", source: "wb", layout: { visibility: "none" } }, LABELS); }
  }
  if (map.getLayer("sat")) { map.setLayoutProperty("sat", "visibility", b === "sat" ? "visible" : "none"); map.setLayoutProperty("wb", "visibility", b === "wb" ? "visible" : "none"); }
  document.querySelectorAll("[data-base]").forEach((x) => x.classList.toggle("on", x.dataset.base === b));
  $("#wb-row").classList.toggle("dim", b !== "wb");
  renderBaseControl();
}
const wbLabel = (id) => { const r = WAYBACK.find((w) => w[1] === id); return r ? r[0].split("-").reverse().join("/") : tx("Theo năm", "By year"); };
function renderWbOptions() {
  $("#wb-year").innerHTML = WAYBACK.map(([d, id]) => `<option value="${id}">${d.split("-").reverse().join("/")}${id === "1049" ? tx(" (sát mốc EUDR)", " (closest to the EUDR cut-off)") : ""}</option>`).join("");
  $("#wb-year").value = S.wb;
}
renderWbOptions();
$("#wb-year").onchange = (e) => setBase("wb", e.target.value);
$("#base-seg").onclick = (e) => { const b = e.target.closest("[data-base]"); if (b) setBase(b.dataset.base); };

// ------------------------------------------------------------------ official 2020 forest lots (vector tiles)
const lotLabel = () => ["concat", ["coalesce", ["get", "ldlr"], ""], "\n", tx("lô ", "lot "), ["coalesce", ["get", "lo"], "?"]];
function addLots() {
  const c = S.meta.grid.coordinates;
  map.addSource("lots", { type: "vector", tiles: [new URL("data/lots/", location.href).href + "{z}/{x}/{y}.pbf"], minzoom: 11, maxzoom: 13,
    bounds: [c[0][0], c[2][1], c[1][0], c[0][1]], attribution: tx("Lô rừng 2020: tnr.vnforest.gov.vn", "2020 forest lots: tnr.vnforest.gov.vn") });
  map.addLayer({ id: "lots-fill", type: "fill", source: "lots", "source-layer": "lots", minzoom: 11, paint: { "fill-color": lotColor(), "fill-opacity": 0.28 } }, LABELS);
  map.addLayer({ id: "lots-line", type: "line", source: "lots", "source-layer": "lots", minzoom: 11,
    paint: { "line-color": "#3e4a3d", "line-opacity": 0.75, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.3, 15, 1.2] } }, LABELS);
  // transparent copy for lookups under a plot, kept even when the visible layers are off
  map.addLayer({ id: "lots-hit", type: "fill", source: "lots", "source-layer": "lots", minzoom: 11, paint: { "fill-opacity": 0 } }, LABELS);
  map.addLayer({ id: "lots-label", type: "symbol", source: "lots", "source-layer": "lots", minzoom: 15,
    layout: { "text-field": lotLabel(), "text-font": ["Noto Sans Regular"], "text-size": 10 },
    paint: { "text-color": "#25331f", "text-halo-color": "#fff", "text-halo-width": 1.2 } });
  map.addLayer({ id: "lot-sel", type: "line", source: "lots", "source-layer": "lots", filter: ["==", ["get", "lo"], "__none__"],
    paint: { "line-color": "#00e5ff", "line-width": 3 } });
  renderLotsLegend();
}
function lotColor() {
  if (S.lotsBy === "qh") return ["match", ["get", "qh"], ...Object.entries(LOT_QH).flatMap(([k, [c]]) => [+k, c]), "#bdbdbd"];
  if (S.lotsBy === "none") return "rgba(0,0,0,0)";
  return ["match", ["get", "cls"], ...Object.entries(LOT_CLS).flatMap(([k, [c]]) => [k, c]), "#ccc"];
}
function renderLotsLegend() {
  const rows = S.lotsBy === "qh" ? Object.values(LOT_QH) : S.lotsBy === "cls" ? Object.values(LOT_CLS) : [];
  $("#lots-legend").innerHTML = rows.map(([c, t]) => `<div class="it"><span class="sw" style="background:${c}"></span><span>${t}</span></div>`).join("");
}
$("#lots-by").onchange = (e) => { S.lotsBy = e.target.value; map.setPaintProperty("lots-fill", "fill-color", lotColor()); renderLotsLegend(); };
$("#t-lots").onchange = (e) => ["lots-fill", "lots-line", "lots-label"].forEach((l) => map.setLayoutProperty(l, "visibility", e.target.checked ? "visible" : "none"));
function lotsAt(lon, lat) {  // lots under a point, from the tiles in view
  if (!map.getLayer("lots-hit") || map.getZoom() < 11) return null;
  const p = map.project([lon, lat]);
  if (p.x < 0 || p.y < 0 || p.x > map.getCanvas().clientWidth || p.y > map.getCanvas().clientHeight) return null;
  const seen = new Set();
  return map.queryRenderedFeatures(p, { layers: ["lots-hit"] }).map((f) => f.properties)
    .filter((q) => { const k = [q.tk, q.kh, q.lo, q.xa].join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
}
function lotRows(q) {
  return `<table>
    <tr><th>${tx("Tiểu khu · khoảnh · lô", "Sub-compartment · compartment · lot")}</th><td>${esc(q.tk ?? "–")} · ${esc(q.kh ?? "–")} · ${esc(q.lo ?? "–")}</td></tr>
    <tr><th>${tx("Địa giới (trước sáp nhập)", "Admin. units (before the merger)")}</th><td>${[q.xa, q.huyen, q.tinh].filter(Boolean).map(esc).join(", ")}</td></tr>
    <tr><th>${tx("Diện tích lô", "Lot area")}</th><td>${q.dt != null ? fmt(+q.dt, 2) + " ha" : "–"}</td></tr>
    <tr><th>${tx("Loại đất, loại rừng", "Land and forest type")}</th><td>${q.ldlr ? `<b>${esc(q.ldlr)}</b> · ${esc(LDLR[q.ldlr] || "")}` : "–"}</td></tr>
    <tr><th>${tx("Nguồn gốc", "Origin")}</th><td>${LOT_CLS[q.cls]?.[1] || "–"}</td></tr>
    <tr><th>${tx("Quy hoạch", "Planning class")}</th><td>${LOT_QH[q.qh]?.[1] || "–"}${q.mdsd ? ` · ${esc(MDSD[q.mdsd] || tx("mã ", "code ") + q.mdsd)}` : ""}</td></tr>
    ${q.cr ? `<tr><th>${tx("Chủ rừng / quản lý", "Forest owner / manager")}</th><td>${esc(q.cr)}</td></tr>` : ""}
    ${q.loai ? `<tr><th>${tx("Loài cây", "Species")}</th><td>${esc(q.loai)}${+q.namtr > 0 ? tx(`, trồng năm ${q.namtr}`, `, planted in ${q.namtr}`) : ""}</td></tr>` : ""}
  </table>`;
}
function lotMeaning(q) {
  if (q.cls === "n") return tx("Rừng tự nhiên năm 2020 theo bản đồ quốc gia. Lô cà phê nằm ở đây sẽ bị hệ thống phân vùng chính thức chú ý; cần chứng minh hiện trạng cuối 2020 không phải rừng hoặc không có chuyển đổi sau 2020.",
    "Natural forest in 2020 on the national map. A coffee plot here will draw the attention of the official zoning; it must be shown that the land was not forest at the end of 2020 or was not converted after 2020.");
  if (q.cls === "p") return q.ldlr === "RTK" ? tx("Rừng trồng cây đa mục đích (thường là cao su, điều). Theo định nghĩa của EUDR, đồn điền nông nghiệp như cao su không phải rừng, nhưng cần xác định đúng loài cây.",
    "Multi-purpose plantation (often rubber or cashew). Under the EUDR definition, agricultural plantations such as rubber are not forest, but the species must be confirmed.")
    : tx("Rừng trồng năm 2020. Theo EUDR, khai thác rồi trồng lại rừng trồng không phải mất rừng; chuyển sang cà phê sau 2020 thì là mất rừng.",
      "Plantation forest in 2020. Under the EUDR, harvesting and replanting a plantation is not deforestation; converting it to coffee after 2020 is.");
  if (q.ldlr === "DNN") return tx("Đất nông nghiệp nằm trong lô lâm nghiệp: bản đồ quốc gia không coi là rừng năm 2020.", "Agricultural land inside a forestry lot: the national map does not count it as forest in 2020.");
  return tx("Bản đồ quốc gia không coi là rừng năm 2020 (đất trống, đất khác).", "The national map does not count it as forest in 2020 (bare or other land).");
}
function openLot(q, lngLat) {
  S.open = { kind: "lot", q, lngLat };
  map.setFilter("lot-sel", ["all", ["==", ["get", "tk"], q.tk ?? ""], ["==", ["get", "kh"], q.kh ?? ""], ["==", ["get", "lo"], q.lo ?? ""], ["==", ["get", "xa"], q.xa ?? ""]]);
  const plots = S.list ? S.list.plots.filter((p) => p.level !== "ngoai" && km([p.lon, p.lat], [lngLat.lng, lngLat.lat]) < 1.5) : [];
  openDrawer(`<div class="kicker">${tx("Lô rừng năm 2020", "2020 forest lot")}</div>
    <h2>${tx("TK", "Sub-c.")} ${esc(q.tk ?? "?")} · ${tx("K", "C.")} ${esc(q.kh ?? "?")} · ${tx("Lô", "Lot")} ${esc(q.lo ?? "?")}</h2>
    <div class="card"><span class="badge" style="background:${LOT_CLS[q.cls]?.[0] || "#999"};color:${q.cls === "x" ? "#3a3200" : "#fff"}">${LOT_CLS[q.cls]?.[1] || tx("Không rõ", "Unknown")}</span>
      <div class="hint" style="margin-top:6px">${lotMeaning(q)}</div></div>
    ${lotRows(q)}
    ${plots.length ? `<h4>${tx("Lô trong danh sách của bạn ở gần (1,5 km)", "Plots of your list nearby (1.5 km)")}</h4><p>${plots.slice(0, 20).map((p) => `<a href="#" data-plot="${esc(p.id)}">${esc(p.id)}</a>`).join(", ")}</p>` : ""}
    <p class="srcline">${tx("Nguồn", "Source")}: ${SRC_VNF}. ${tx("Tên đơn vị hành chính theo địa giới trước 07/2025. Ranh giới được đơn giản hóa khoảng 1–2 m để hiển thị.",
      "Administrative names follow the units before 07/2025. Outlines are simplified by about 1–2 m for display.")}</p>`);
}

// ------------------------------------------------------------------ grid
function toMerc(lon, lat) { return [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R]; }
function fromMerc(x, y) { return [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI]; }
function cell(lon, lat) {
  const g = S.meta.grid, [x, y] = toMerc(lon, lat);
  const c = Math.floor((x - g.x0) / g.px_m), r = Math.floor((g.y1 - y) / g.px_m);
  if (c < 0 || r < 0 || c >= g.width || r >= g.height) return null;
  return decode(r * g.width + c);
}
function decode(i) {
  const d = S.grid, R8 = d[i * 4], G8 = d[i * 4 + 1], B8 = d[i * 4 + 2];
  if (!(R8 & 128)) return null;
  const v = { gfcV1: R8 & 1, gfcV2: (R8 >> 1) & 1, gfcV3: (R8 >> 2) & 1, gfcV4: (R8 >> 3) & 1, tmf: (R8 >> 4) & 1,
    han: (R8 >> 5) & 1, wc: (R8 >> 6) & 1, lossyear: G8 & 31, loss: (G8 >> 7) & 1, prov: PROV_CODE[B8 & 7], offc: (B8 >> 3) & 3 };
  v.off = v.offc === 1 || v.offc === 2 ? 1 : 0;
  v.n = v.gfcV4 + v.tmf + v.han + v.wc;
  v.tier = tierOf(v.n, v.loss, v.gfcV1 !== v.gfcV4, v.off);
  return v;
}
function tierOf(n, loss, v1v4, off) {  // same rule as build_data.tier
  const anyf = n >= 1 || off;
  if (loss && anyf) return 3;
  if (n === 4 && off && !v1v4) return 0;
  if (!anyf && !v1v4) return 1;
  return 2;
}
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function colorOf(v) {
  switch (S.mode) {
    case "tier": return [hex(TIER[v.tier].color), v.tier === 1 ? 150 : 255];
    case "agree": return [hex(AGREE[v.n]), v.n === 0 ? 130 : 255];
    case "v1v4": { const k = v.gfcV1 && v.gfcV4 ? "both" : v.gfcV1 ? "v1" : v.gfcV4 ? "v4" : "none"; return [hex(V1V4[k][0]), k === "none" ? 90 : 255]; }
    case "loss": return v.lossyear ? [hex(LOSS[v.lossyear]), 255] : v.loss ? [hex("#9e9ac8"), 255] : [[0, 0, 0], 0];
    case "off": return v.offc ? [hex(OFFC[v.offc][0]), 255] : [[0, 0, 0], 0];
  }
}
let gridCanvas;
function renderGrid() {
  const g = S.meta.grid, n = g.width * g.height;
  gridCanvas ||= Object.assign(document.createElement("canvas"), { width: g.width, height: g.height });
  const ctx = gridCanvas.getContext("2d"), img = ctx.createImageData(g.width, g.height);
  for (let i = 0; i < n; i++) {
    const v = decode(i);
    if (!v) continue;
    const [c, a] = colorOf(v);
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const url = gridCanvas.toDataURL(), src = map.getSource("grid");
  if (src) src.updateImage({ url, coordinates: g.coordinates });
  else {
    map.addSource("grid", { type: "image", url, coordinates: g.coordinates });
    map.addLayer({ id: "grid", type: "raster", source: "grid",
      paint: { "raster-opacity": gridOpacity(), "raster-resampling": "nearest", "raster-fade-duration": 0 } }, LABELS);
  }
  renderLegend();
}
// cells are 500 m: fade them when zoomed in to plot level so the lots and the imagery stay visible
function gridOpacity() { const o = +$("#opacity").value; return ["interpolate", ["linear"], ["zoom"], 10, o, 13, o * 0.25, 15, 0]; }
function renderLegend() {
  let rows = [];
  if (S.mode === "tier") rows = [3, 2, 1, 0].map((k) => [TIER[k].color, `<b>${TIER[k].name}</b>: ${TIER[k].text}`]);
  if (S.mode === "agree") rows = [4, 3, 2, 1, 0].map((k) => [AGREE[k], tx(`${k} trên 4 bản đồ (GFC2020 V4, TMF, Hansen, WorldCover)`, `${k} of 4 maps (GFC2020 V4, TMF, Hansen, WorldCover)`)]);
  if (S.mode === "v1v4") rows = Object.values(V1V4);
  if (S.mode === "loss") rows = Object.entries(LOSS).map(([y, c]) => [c, tx(`Hansen: mất tán năm 20${y}`, `Hansen: tree-cover loss in 20${y}`)])
    .concat([["#9e9ac8", tx("Chỉ JRC TMF ghi nhận mất / suy thoái", "Loss or degradation in JRC TMF only")]]);
  if (S.mode === "off") rows = Object.values(OFFC).concat([["#ffffff", tx("Ngoài các lô lâm nghiệp (để trống)", "Outside forestry lots (left blank)")]]);
  $("#legend").innerHTML = rows.map(([c, t]) => `<div class="it"><span class="sw" style="background:${c}"></span><span>${t}</span></div>`).join("")
    + (S.mode === "off" ? `<p class="srcline">${tx("Nguồn", "Source")}: ${SRC_VNF}</p>` : "");
}

// ------------------------------------------------------------------ research items (1780, with evidence sheets)
function addItems(fc) {
  fc.features.forEach((f) => { f.properties.vcat = f.properties.ref ? f.properties.ref.verdict : "nolabel"; });
  S.items = fc;
  const pts = { type: "FeatureCollection", features: fc.features.map((f) => ({ type: "Feature", properties: { id: f.properties.id, vcat: f.properties.vcat },
    geometry: { type: "Point", coordinates: [f.properties.lon, f.properties.lat] } })) };
  const color = ["match", ["get", "vcat"], ...Object.entries(VERDICT).flatMap(([k, [c]]) => [k, c]), "#636363"];
  map.addSource("items", { type: "geojson", data: fc });
  map.addSource("items-pt", { type: "geojson", data: pts });
  map.addLayer({ id: "items-fill", type: "fill", source: "items", minzoom: 12, paint: { "fill-color": color, "fill-opacity": 0.2 } });
  map.addLayer({ id: "items-line", type: "line", source: "items", minzoom: 12, paint: { "line-color": color, "line-width": 1.5 } });
  map.addLayer({ id: "items-pt", type: "circle", source: "items-pt", maxzoom: 13,
    paint: { "circle-color": color, "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 6], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
  map.addLayer({ id: "sel", type: "line", source: "items", paint: { "line-color": "#ffd400", "line-width": 4 }, filter: ["==", ["get", "id"], ""] });
}
function itemById(id) { return S.items.features.find((f) => f.properties.id === id); }
function setItemsVisible(on) {
  $("#t-items").checked = on;
  ["items-fill", "items-line", "items-pt"].forEach((l) => map.getLayer(l) && map.setLayoutProperty(l, "visibility", on ? "visible" : "none"));
}
function yn(b) { return b ? `<span class="yes">${tx("có", "yes")}</span>` : `<span class="no">${tx("không", "no")}</span>`; }
function spark(v) {
  const W = 400, H = 70, pad = 18, xs = (i) => pad + i * (W - 2 * pad) / (v.length - 1);
  const pts = v.map((y, i) => (y == null ? null : [xs(i), H - 14 - y * (H - 24)]));
  const path = pts.filter(Boolean).map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
  const cut = pad + 1.5 * (W - 2 * pad) / (v.length - 1);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tx("NDVI mùa khô 2019 đến 2026", "Dry-season NDVI 2019 to 2026")}">
    <line x1="${cut}" x2="${cut}" y1="4" y2="${H - 14}" stroke="#b2182b" stroke-dasharray="3 3"/>
    <text x="${cut + 3}" y="12" font-size="10" fill="#b2182b">31/12/2020</text>
    <path d="${path}" fill="none" stroke="#1c6b35" stroke-width="2"/>
    ${pts.filter(Boolean).map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#1c6b35"/>`).join("")}
    ${v.map((_, i) => `<text x="${xs(i)}" y="${H - 2}" font-size="10" text-anchor="middle" fill="#6b716d">${2019 + i}</text>`).join("")}</svg>`;
}
function imageButtons() {
  return `<div class="btns wrap imgbtns"><button class="ghost sm" data-setbase="wb:1049">${tx("Ảnh 01/2021 trên bản đồ", "01/2021 imagery on the map")}</button>
    <button class="ghost sm" data-setbase="sat">${tx("Ảnh mới nhất trên bản đồ", "Latest imagery on the map")}</button></div>`;
}
function imageLinks(lat, lon) {
  return `<div class="links">
    <a href="https://livingatlas.arcgis.com/wayback/#mapCenter=${lon}%2C${lat}%2C17" target="_blank" rel="noopener">${tx("Esri Wayback (mọi bản ảnh)", "Esri Wayback (all releases)")}</a>
    <a href="https://browser.dataspace.copernicus.eu/?zoom=15&lat=${lat}&lng=${lon}" target="_blank" rel="noopener">Copernicus Browser (Sentinel-2)</a>
    <a href="https://earth.google.com/web/@${lat},${lon},600a,1500d,35y,0h,0t,0r" target="_blank" rel="noopener">Google Earth</a></div>`;
}
function refBlock(p) {
  if (!p.ref) return `<p class="muted">${tx("Lô này chưa có trong đợt gán nhãn 1000 lô.", "This plot is not in the 1000-plot labelling batch.")}</p>`;
  return `<div><span class="badge v-${p.ref.verdict}">${VNAME[p.ref.verdict]}</span> <span class="muted">${tx("theo hàm luật Điều 2 trên các câu trả lời dưới đây", "from the Article 2 rule applied to the answers below")}</span></div>
    <table>
      <tr><th>${tx("Sử dụng đất 31/12/2020", "Land use on 31/12/2020")}</th><td>${LANDUSE[p.ref.land_use] || "–"} · ${p.ref.forest_2020 ? tx("là rừng", "forest") : tx("không phải rừng", "not forest")} ${tx("theo định nghĩa EUDR", "under the EUDR definition")}</td></tr>
      <tr><th>${tx("Thay đổi sau 2020", "Change after 2020")}</th><td>${CHANGE[p.ref.change] || "–"}</td></tr>
      <tr><th>${tx("Nguồn nhãn", "Label source")}</th><td>${SOURCE[p.ref.source] || esc(p.ref.source)}, ${tx("độ tin cậy", "confidence")} ${CONF[p.ref.conf] || esc(p.ref.conf)}</td></tr>
      ${p.ref.person_verdict ? `<tr><th>${tx("Riêng nhãn người", "Person labels only")}</th><td>${VNAME[p.ref.person_verdict] || esc(p.ref.person_verdict)}</td></tr>` : ""}
    </table>`;
}
function offShares(o) {
  return tx(`rừng tự nhiên ${pct(o.natural)}, rừng trồng ${pct(o.plantation)}, chưa có rừng ${pct(o.nonforest)}, ngoài lô ${pct(o.outside)}`,
    `natural forest ${pct(o.natural)}, plantation ${pct(o.plantation)}, not forest ${pct(o.nonforest)}, outside lots ${pct(o.outside)}`);
}
function openItem(id) {
  const f = itemById(id); if (!f) return;
  S.open = { kind: "item", id };
  const p = f.properties, m = p.maps, mf = p.mf;
  map.setFilter("sel", ["==", ["get", "id"], id]);
  const share = { gfcV1: mf.gfcV1, gfcV4: mf.gfcV4, tmf: mf.tmf_natural, wc: mf.wc20_tree };
  openDrawer(`
    <div class="kicker">${tx("Lô nghiên cứu", "Study plot")}</div>
    <h2>${esc(p.id)}</h2>
    <div class="muted">${p.kind === "alert" ? tx("Vùng cảnh báo mất tán", "Tree-cover loss alert") + (p.alert ? tx(" từ ", " from ") + p.alert : "") : tx("Lô cà phê 1 ha (mẫu hệ thống)", "1 ha coffee plot (systematic sample)")} · ${fmt(p.area, 2)} ha · ${esc(PROV_VI[p.prov] || p.prov)}</div>
    <div class="card"><span class="badge b${p.tier}">${tx("Ưu tiên", "Priority")}: ${TIER[p.tier].name}</span><div class="hint">${TIER[p.tier].text}.</div></div>
    <h4>${tx("Tấm bằng chứng Sentinel-2", "Sentinel-2 evidence sheet")}</h4>
    <img class="sheet" loading="lazy" src="sheets/${esc(p.id)}.jpg" alt="${tx(`Ảnh Sentinel-2 màu thật và hồng ngoại theo thời gian, kèm đường NDVI của lô ${esc(p.id)}`, `Sentinel-2 true-colour and infrared images over time, with the NDVI curve of plot ${esc(p.id)}`)}">
    <p class="hint">${tx("Hàng trên: màu thật. Hàng dưới: hồng ngoại (thực vật màu đỏ). Viền vàng là ranh giới lô. Bấm để phóng to.",
      "Top row: true colour. Bottom row: infrared (vegetation in red). The yellow line is the plot outline. Click to enlarge.")}</p>
    ${imageButtons()}
    <h4>${tx("Các bản đồ nói gì về năm 2020", "What the maps say about 2020")}</h4>
    <table><tr><th>${tx("Bản đồ", "Map")}</th><th>${tx("Gọi là rừng", "Calls it forest")}</th><th class="num">${tx("Tỷ lệ diện tích", "Share of area")}</th></tr>
      ${MAPS.filter(([k]) => k !== "off").map(([k, t]) => `<tr><td>${t}</td><td>${yn(m[k])}</td><td class="num">${k === "han" ? (mf.tc2000 != null ? tx(`che phủ 2000 ${fmt(mf.tc2000)}%, mất trước 2021 ${pct(mf.hl_pre2021)}`, `cover in 2000 ${fmt(mf.tc2000)}%, lost before 2021 ${pct(mf.hl_pre2021)}`) : "–") : pct(share[k])}</td></tr>`).join("")}
      <tr><td>${MAPS[5][1]}</td><td>${yn(m.off)}</td><td class="num">${p.off ? offShares(p.off) : "–"}</td></tr>
      <tr><td>${tx("Mất tán sau 2020 (Hansen / GFW)", "Tree-cover loss after 2020 (Hansen / GFW)")}</td><td>${yn(m.loss)}</td><td class="num">${pct(mf.hl_post2020)} / ${pct(mf.gfw_post2020)}</td></tr></table>
    <div id="lot-here"></div>
    <h4>${tx("NDVI mùa khô (tháng 1 đến 4)", "Dry-season NDVI (January to April)")}</h4>${spark(p.ndvi)}
    ${p.model != null ? `<h4>${tx("Mô hình chuỗi thời gian (thử nghiệm)", "Time-series model (experimental)")}</h4>
      <div class="row"><div class="prob" style="flex:1"><span style="width:${100 * p.model}%"></span></div><b>${pct(p.model)}</b></div>
      <p class="hint">${tx(`Xác suất mất rừng sau 2020, dự đoán chéo (mô hình không thấy nhãn của lô này khi huấn luyện). Độ chính xác cân bằng khoảng 0,74 và
        <b>bỏ sót gần một nửa số ca mất rừng</b>, nên chỉ dùng để xếp thứ tự.`,
        `Probability of deforestation after 2020, cross-validated (the model did not see this plot's label in training). Balanced accuracy is about 0.74 and it
        <b>misses almost half of the deforestation cases</b>, so use it only to rank plots.`)}</p>` : ""}
    <h4>${tx("Nhãn tham chiếu", "Reference label")}</h4>${refBlock(p)}
    <h4>${tx("Xem ảnh khác", "Other imagery")}</h4>${imageLinks(p.lat, p.lon)}`);
  fillLotHere(p.lon, p.lat);
}
function flyItem(id) { const f = itemById(id); if (!f) return; go("map"); map.flyTo({ center: [f.properties.lon, f.properties.lat], zoom: 15 }); openItem(id); }
function fillLotHere(lon, lat) {  // the official lot under the plot, once the tiles at the plot are on screen
  const el = $("#lot-here"); if (!el) return;
  el.innerHTML = `<p class="hint">${tx("Đang tìm lô rừng 2020 tại vị trí này…", "Looking up the 2020 forest lot at this place…")}</p>`;
  const token = (fillLotHere.token = (fillLotHere.token || 0) + 1);  // a newer lookup (another plot) wins
  const t0 = Date.now();
  const show = () => {
    const box = $("#lot-here"); if (!box || token !== fillLotHere.token) return;
    const qs = lotsAt(lon, lat);
    // wait (polling, not map events: a flight can be cut short and then no event comes) until the map is still at the plot with its tiles
    if ((qs == null || map.isMoving() || !map.areTilesLoaded()) && Date.now() - t0 < 20000) { setTimeout(show, 500); return; }
    if (qs == null) { box.innerHTML = `<p class="hint">${tx("Phóng to tới lô để xem lô rừng 2020 tại vị trí này.", "Zoom in to the plot to see the 2020 forest lot at this place.")}</p>`; return; }
    box.innerHTML = qs.length ? `<h4>${tx("Lô rừng 2020 tại vị trí này", "2020 forest lot at this place")} <span class="src">tnr.vnforest.gov.vn</span></h4>${qs.slice(0, 2).map((q) =>
      `<div class="card lotcard"><b>${LOT_CLS[q.cls]?.[1] || ""}</b> · ${esc(q.ldlr || "")} ${esc(LDLR[q.ldlr] || "")}${lotRows(q)}<div class="hint">${lotMeaning(q)}</div></div>`).join("")}`
      : `<h4>${tx("Lô rừng 2020 tại vị trí này", "2020 forest lot at this place")}</h4><p class="hint">${tx("Vị trí nằm ngoài mọi lô lâm nghiệp của bản đồ diễn biến rừng 2020 (bản đồ quốc gia ngầm coi là không phải rừng).",
        "The place lies outside every forestry lot of the 2020 forest-status map (the national map implicitly counts it as not forest).")}</p>`;
  };
  setTimeout(show, 300);
}

// ------------------------------------------------------------------ drawer and lightbox
function openDrawer(html) { $("#drawer-body").innerHTML = html; $("#drawer").hidden = false; $("#drawer").scrollTop = 0; }
function closeDrawer() {
  S.open = null;
  $("#drawer").hidden = true;
  if (map.getLayer("sel")) map.setFilter("sel", ["==", ["get", "id"], ""]);
  if (map.getLayer("plot-sel")) map.setFilter("plot-sel", ["==", ["get", "id"], ""]);
  if (map.getLayer("lot-sel")) map.setFilter("lot-sel", ["==", ["get", "lo"], "__none__"]);
}
$("#drawer-close").onclick = closeDrawer;
$("#drawer-body").addEventListener("click", (e) => {
  if (e.target.matches("img.sheet")) { $("#lightbox img").src = e.target.src; $("#lightbox").hidden = false; }
  const a = e.target.closest("[data-item]"); if (a) { e.preventDefault(); flyItem(a.dataset.item); return; }
  const pl = e.target.closest("[data-plot]"); if (pl) { e.preventDefault(); flyPlot(pl.dataset.plot); return; }
  const b = e.target.closest("[data-setbase]");
  if (b) { const [base, id] = b.dataset.setbase.split(":"); setBase(base, id); }
});
$("#lightbox").onclick = () => ($("#lightbox").hidden = true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#lightbox").hidden = true; });

// ------------------------------------------------------------------ geometry helpers
function rings(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  if (geom.type === "GeometryCollection") return geom.geometries.flatMap(rings);
  return [];
}
function inPoly(x, y, polys) {
  for (const poly of polys) {
    let inThis = false;
    poly.forEach((ring, ri) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      if (ri === 0) inThis = c; else if (c) inThis = false;
    });
    if (inThis) return true;
  }
  return false;
}
function areaHa(polys) {
  let a = 0;
  for (const poly of polys) poly.forEach((ring, ri) => {
    let s = 0; const k = Math.cos(ring[0][1] * Math.PI / 180);
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      s += ring[j][0] * 111320 * k * ring[i][1] * 110570 - ring[i][0] * 111320 * k * ring[j][1] * 110570;
    a += (ri === 0 ? 1 : -1) * Math.abs(s / 2);
  });
  return a / 1e4;
}
function centroid(polys) {
  let sx = 0, sy = 0, n = 0;
  for (const poly of polys) for (const [x, y] of poly[0]) { sx += x; sy += y; n++; }
  return n ? [sx / n, sy / n] : null;
}
function bbox(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

// ------------------------------------------------------------------ communes
function prepCommunes(fc) {
  S.communes = fc.features.map((f) => { const p = rings(f.geometry); return { xa: f.properties.xa, tinh: f.properties.tinh, polys: p, bb: bbox(p) }; });
  map.addSource("communes", { type: "geojson", data: fc });
  map.addLayer({ id: "communes", type: "line", source: "communes", layout: { visibility: "none" },
    paint: { "line-color": "#5b6770", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 13, 1.4], "line-dasharray": [2, 1] } }, LABELS);
}
function communeAt(lon, lat) {
  for (const c of S.communes) {
    const [w, s, e, n] = c.bb;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (inPoly(lon, lat, c.polys)) return c;
  }
  return null;
}

// ------------------------------------------------------------------ reading a plot list
const ALIAS = {
  id: ["malo", "ma", "id", "plotid", "plot", "lo", "maso", "productionplace", "code", "mathua", "thua"],
  lat: ["vido", "lat", "latitude", "y"],
  lon: ["kinhdo", "lon", "lng", "long", "longitude", "x"],
  xa: ["xa", "xaphuong", "phuongxa", "commune", "ward"],
  ho: ["hodan", "ho", "tenho", "nongho", "chuho", "farmer", "producer", "producername"],
  area: ["dientichha", "dientich", "area", "areaha", "ha"],
};
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");
function pick(obj) {
  const keys = Object.keys(obj), out = {};
  for (const [f, al] of Object.entries(ALIAS)) { const k = keys.find((k) => al.includes(norm(k))); out[f] = k == null ? null : obj[k]; }
  return out;
}
const num = (v) => (v == null || String(v).trim() === "" ? NaN : parseFloat(String(v).trim().replace(",", ".")));
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [";", "\t", ","].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.some((x) => x.trim() !== "")).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}
function rowsFromGeoJSON(gj) {
  const feats = gj.type === "FeatureCollection" ? gj.features : gj.type === "Feature" ? [gj] : [{ type: "Feature", properties: {}, geometry: gj }];
  return feats.map((f) => {
    const p = pick(f.properties || {}), g = f.geometry;
    if (g && g.type === "Point") return { ...p, lon: g.coordinates[0], lat: g.coordinates[1], geom: null };
    const polys = rings(g), c = centroid(polys);
    return { ...p, lon: c ? c[0] : null, lat: c ? c[1] : null, geom: polys.length ? g : null };
  });
}
function readList(text) {
  const t = text.trim();
  const raw = t.startsWith("{") || t.startsWith("[") ? rowsFromGeoJSON(JSON.parse(t)) : parseCSV(text).map((r) => ({ ...pick(r), geom: null }));
  if (!raw.length) throw new Error(tx("Tệp không có dòng dữ liệu nào.", "The file has no data rows."));
  if (raw.every((r) => r.lat == null && r.lon == null)) throw new Error(tx("Không tìm thấy cột tọa độ (vi_do, kinh_do hoặc lat, lon).", "No coordinate columns found (vi_do, kinh_do or lat, lon)."));
  return raw;
}

// ------------------------------------------------------------------ screening a list
function screenCells(p) {
  const polys = rings(p.geom), cells = [];
  if (polys.length) {
    const g = S.meta.grid, [w, s, e, n] = bbox(polys), [mx0, my0] = toMerc(w, n), [mx1, my1] = toMerc(e, s);
    const c0 = Math.max(0, Math.floor((mx0 - g.x0) / g.px_m)), c1 = Math.min(g.width - 1, Math.floor((mx1 - g.x0) / g.px_m));
    const r0 = Math.max(0, Math.floor((g.y1 - my0) / g.px_m)), r1 = Math.min(g.height - 1, Math.floor((g.y1 - my1) / g.px_m));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const [lon, lat] = fromMerc(g.x0 + (c + 0.5) * g.px_m, g.y1 - (r + 0.5) * g.px_m);
      if (inPoly(lon, lat, polys)) { const v = decode(r * g.width + c); if (v) cells.push(v); }
    }
  }
  if (!cells.length) { const v = cell(p.lon, p.lat); if (v) cells.push(v); }
  return cells;
}
function researchMatch(p) {  // a study item at the same place: its evidence sheet and label apply
  let best = null;
  for (const f of S.items.features) {
    const q = f.properties;
    if (Math.abs(q.lat - p.lat) > 0.01 || Math.abs(q.lon - p.lon) > 0.01) continue;
    const d = km([p.lon, p.lat], [q.lon, q.lat]);
    if ((inPoly(p.lon, p.lat, rings(f.geometry)) || d < 0.06) && (!best || d < best[0])) best = [d, q.id];
  }
  return best ? best[1] : null;
}
function buildList(name, raw) {
  const plots = [], skipped = [], seenId = new Map(), seenXY = new Map();
  raw.forEach((r, i) => {
    const line = i + 2, warn = [];
    let lat = num(r.lat), lon = num(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped.push({ line, id: r.id || "", why: { c: "coords" } }); return; }
    if (lat > 100 && lat < 112 && lon > 5 && lon < 25) { [lat, lon] = [lon, lat]; warn.push({ c: "swap" }); }
    let id = String(r.id ?? "").trim();
    if (!id) { id = `DONG-${line}`; warn.push({ c: "noid" }); }
    if (seenId.has(id)) { const k = seenId.get(id) + 1; seenId.set(id, k); warn.push({ c: "dupid", a: id }); plots.find((x) => x.id === id)?.warn.push({ c: "dupid2" }); id = `${id} (${k})`; }
    else seenId.set(id, 1);
    const xy = lat.toFixed(5) + "," + lon.toFixed(5);
    if (seenXY.has(xy)) warn.push({ c: "dupxy", a: seenXY.get(xy) }); else seenXY.set(xy, id);
    const polys = rings(r.geom);
    let area = num(r.area);
    if (polys.length) area = areaHa(polys);
    if (area > 4 && !polys.length) warn.push({ c: "big" });
    if (lat < 8 || lat > 24 || lon < 102 || lon > 110) warn.push({ c: "outvn" });
    const p = { id, line, ho: r.ho ? String(r.ho).trim() : "", xa: r.xa ? String(r.xa).trim() : "", lat, lon, geom: r.geom || null,
      area: Number.isFinite(area) ? area : null, warn };
    const cells = screenCells(p);
    p.ncell = cells.length;
    if (!cells.length) { p.level = "ngoai"; p.reasonKey = "ngoai"; }
    else {
      const has = (t) => cells.some((v) => v.tier === t);
      if (has(3)) { p.level = "cao"; p.reasonKey = "cao"; }
      else if (has(2)) { p.level = "tb"; p.reasonKey = "tb"; }
      else if (has(0)) { p.level = "tb"; p.reasonKey = "tb_forest"; }
      else { p.level = "thap"; p.reasonKey = "thap"; }
      const mean = (k) => cells.reduce((s, v) => s + v[k], 0) / cells.length;
      p.maps = Object.fromEntries(MAPS.map(([k]) => [k, mean(k)]));
      p.offc = [1, 2, 3, 0].map((k) => cells.filter((v) => v.offc === k).length / cells.length);  // natural, plantation, nonforest, outside
      p.loss = mean("loss");
      p.lossYears = [...new Set(cells.filter((v) => v.lossyear).map((v) => 2000 + v.lossyear))].sort();
      p.prov = cells[0].prov;
    }
    const c = communeAt(lon, lat);
    p.xaAuto = c ? c.xa : ""; p.tinh = c ? c.tinh : "";
    p.match = researchMatch(p);
    if (p.match && p.level !== "ngoai") {  // the study item was measured on its own outline: better than the nearest 500 m point
      const t = itemById(p.match).properties.tier;
      p.level = t === 3 ? "cao" : t === 1 ? "thap" : "tb";
      p.reasonKey = t === 3 ? "cao" : t === 1 ? "thap" : t === 0 ? "tb_forest" : "tb";
      p.exact = true;
    }
    plots.push(p);
  });
  const key = "veudr:rev:" + hash32(name + "|" + plots.map((p) => p.id).join("|")).toString(36);
  return { name, key, plots, skipped };
}
function sampled(p) { return S.rate > 0 && (p.level === "tb" || p.level === "thap") && S.sampleSet.has(p.id); }
function drawSample() {  // reproducible spot-check: the lowest hashes of each level
  S.sampleSet = new Set();
  if (!S.rate) return;
  for (const lv of ["tb", "thap"]) {
    const ps = S.list.plots.filter((p) => p.level === lv).sort((a, b) => hash32(a.id) - hash32(b.id));
    if (ps.length) ps.slice(0, Math.max(1, Math.ceil(S.rate * ps.length))).forEach((p) => S.sampleSet.add(p.id));
  }
}
function defaultStatus(p) { return p.level === "ngoai" ? "ngoai" : p.level === "cao" || sampled(p) ? "cho_xem" : "khong_can"; }
function statusOf(p) { return S.rev[p.id]?.status || defaultStatus(p); }
const xaOf = (p) => p.xa || p.xaAuto || tx("Chưa rõ xã", "Unknown commune");
const offText = (p) => (p.offc ? (p.offc[0] + p.offc[1] > 0 ? (p.offc[0] >= p.offc[1] ? tx("rừng tự nhiên", "natural forest") : tx("rừng trồng", "plantation forest"))
  : p.offc[2] > 0 ? tx("chưa có rừng", "not forest") : tx("ngoài lô", "outside lots")) : "–");
const SAMPLE_NAME = () => tx("Danh sách mẫu (lô cà phê của nghiên cứu)", "Sample list (the study's coffee plots)");
const listTitle = (n) => (n === "__sample__" ? SAMPLE_NAME() : n);

function loadList(listName, text, persist = true) {
  S.list = buildList(listName, readList(text));
  S.rev = store.get(S.list.key) || {};
  const st = store.get("veudr:settings") || {};
  S.rate = st.rate != null ? st.rate : 0.05;
  $("#rate").value = String(S.rate);
  drawSample();
  if (persist && !store.set("veudr:last", { name: listName, text })) store.del("veudr:last");
  $("#plots-empty").hidden = true; $("#plots-loaded").hidden = false;
  $("#list-name").textContent = listTitle(listName);
  setItemsVisible(false);
  refreshAll();
  if (S.route !== "plots") go("plots");
  const pts = S.list.plots.filter((p) => p.level !== "ngoai");
  if (pts.length) {
    let w = 180, s = 90, e = -180, n = -90;
    pts.forEach((p) => { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); });
    map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 14, duration: 600 });
  }
}
function saveRev() { if (S.list) store.set(S.list.key, S.rev); }
function refreshAll() { drawPlots(); renderList(); renderField(); renderNavCounts(); if (S.route === "report") renderReport(); }

// ------------------------------------------------------------------ plots on the map
function plotsFC() {
  return { type: "FeatureCollection", features: S.list.plots.map((p) => ({ type: "Feature",
    properties: { id: p.id, level: p.level, status: statusOf(p) }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) };
}
function polysFC() {
  return { type: "FeatureCollection", features: S.list.plots.filter((p) => p.geom).map((p) => ({ type: "Feature", properties: { id: p.id, level: p.level }, geometry: p.geom })) };
}
const levelColor = ["match", ["get", "level"], ...Object.entries(LEVEL).flatMap(([k, v]) => [k, v.color]), "#999"];
function drawPlots() {
  if (!S.list) return;
  if (map.getSource("plots")) { map.getSource("plots").setData(plotsFC()); map.getSource("plots-poly").setData(polysFC()); return; }
  map.addSource("plots", { type: "geojson", data: plotsFC() });
  map.addSource("plots-poly", { type: "geojson", data: polysFC() });
  map.addLayer({ id: "plots-poly", type: "line", source: "plots-poly", minzoom: 11, paint: { "line-color": levelColor, "line-width": 2.5 } });
  map.addLayer({ id: "plots", type: "circle", source: "plots", paint: {
    "circle-color": ["case", ["==", ["get", "status"], "van_de"], "#111111", levelColor],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 12, 7, 16, 9],
    "circle-opacity": ["match", ["get", "status"], ["ok_anh", "ok_td", "khong_can"], 0.45, 1],
    "circle-stroke-color": ["match", ["get", "status"], "can_td", "#111111", "#ffffff"],
    "circle-stroke-width": ["match", ["get", "status"], "can_td", 2.5, 1.2] } });
  map.addLayer({ id: "plot-sel", type: "circle", source: "plots", filter: ["==", ["get", "id"], ""],
    paint: { "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ffd400", "circle-stroke-width": 3.5 } });
}
function removePlots() {
  ["plot-sel", "plots", "plots-poly", "route-num", "route"].forEach((l) => map.getLayer(l) && map.removeLayer(l));
  ["plots", "plots-poly", "route"].forEach((s) => map.getSource(s) && map.removeSource(s));
}

// ------------------------------------------------------------------ list panel
function counts() {
  const c = { level: {}, status: {} };
  for (const p of S.list.plots) { c.level[p.level] = (c.level[p.level] || 0) + 1; const s = statusOf(p); c.status[s] = (c.status[s] || 0) + 1; }
  return c;
}
function funnelNumbers() {
  const c = counts(), st = (k) => c.status[k] || 0;
  return { c, st, n: S.list.plots.length, review: st("cho_xem") + st("ok_anh") + st("can_td") + st("ok_td") + st("van_de"), field: st("can_td") + st("ok_td") + st("van_de") };
}
function renderList() {
  if (!S.list) return;
  const L = S.list, { c, st, n, review, field } = funnelNumbers();
  $("#list-name").textContent = listTitle(L.name);
  $("#funnel").innerHTML = `
    <div><b>${fmt(n)}</b><small>${tx("lô trong danh sách", "plots in the list")}</small></div><span class="arr">→</span>
    <div class="hl"><b>${fmt(review)}</b><small>${tx("cần xem ảnh", "to check on imagery")}<br>(${pct(review / n)})</small></div><span class="arr">→</span>
    <div class="hl2"><b>${fmt(field)}</b><small>${tx("cần thực địa", "need a field visit")}</small></div>
    <p class="hint wide">${tx("Còn chờ xem ảnh", "Awaiting image check")}: <b>${fmt(st("cho_xem"))}</b> · ${tx("đã xong", "done")}: ${fmt(st("ok_anh") + st("ok_td"))} · ${tx("có vấn đề", "problems")}: ${fmt(st("van_de"))}
      ${st("ngoai") ? ` · ${tx("chưa sàng lọc được (ngoài vùng)", "not screened (outside the area)")}: ${fmt(st("ngoai"))}` : ""}</p>`;
  $("#levels").innerHTML = `<div class="bar">${Object.entries(LEVEL).map(([k, v]) => `<span style="width:${100 * (c.level[k] || 0) / n}%;background:${v.color}"></span>`).join("")}</div>
    <div class="lvls">${Object.entries(LEVEL).filter(([k]) => c.level[k]).map(([k, v]) => `<span><span class="sw" style="background:${v.color}"></span>${v.name} <b>${fmt(c.level[k])}</b></span>`).join("")}</div>`;
  const warned = L.plots.filter((p) => p.warn.length);
  $("#issues").innerHTML = warned.length || L.skipped.length ? `<details class="card issues"><summary><b>${tx("Kiểm tra dữ liệu", "Data check")}:</b>
      ${L.skipped.length ? tx(`${L.skipped.length} dòng bị bỏ qua, `, `${L.skipped.length} rows skipped, `) : ""}${tx(`${warned.length} lô có cảnh báo`, `${warned.length} plots with warnings`)}</summary>
      <ul>${L.skipped.map((s) => `<li>${tx("Dòng", "Row")} ${s.line}${s.id ? ` (${esc(s.id)})` : ""}: ${esc(warnText(s.why))}</li>`).join("")}
      ${warned.slice(0, 50).map((p) => `<li><a href="#" data-plot="${esc(p.id)}">${esc(p.id)}</a>: ${p.warn.map((w) => esc(warnText(w))).join("; ")}</li>`).join("")}</ul></details>` : "";
  const fs = $("#f-status"), cur = fs.value;
  fs.innerHTML = `<option value="">${tx("Mọi trạng thái", "All statuses")}</option>` + STATUS_ORDER.filter((k) => c.status[k]).map((k) => `<option value="${k}">${STATUS[k].name} (${c.status[k]})</option>`).join("");
  fs.value = c.status[cur] ? cur : "";
  renderTable();
}
function renderTable() {
  const lv = $("#f-level").value, stf = $("#f-status").value, q = norm($("#f-q").value);
  const rows = S.list.plots.filter((p) => (!lv || p.level === lv) && (!stf || statusOf(p) === stf) && (!q || norm(p.id + " " + p.ho + " " + xaOf(p)).includes(q)))
    .sort((a, b) => STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b)) || LEVEL[a.level].order - LEVEL[b.level].order || a.id.localeCompare(b.id));
  const max = 300;
  $("#table").innerHTML = `<table class="list"><tr><th>${tx("Mã lô", "Plot")}</th><th>${tx("Xã", "Commune")}</th><th>${tx("Mức", "Level")}</th><th>${tx("Trạng thái", "Status")}</th></tr>
    ${rows.slice(0, max).map((p) => { const s = statusOf(p); return `<tr data-plot="${esc(p.id)}">
      <td>${esc(p.id)}${p.warn.length ? ` <span class="wmark" title="${tx("Có cảnh báo dữ liệu", "Data warning")}">!</span>` : ""}</td><td>${esc(xaOf(p))}</td>
      <td><span class="sw" style="background:${LEVEL[p.level].color}"></span> ${LEVEL[p.level].name}${sampled(p) ? ` <span class="tag" title="${tx("Được chọn kiểm tra ngẫu nhiên", "Picked for a random check")}">${tx("mẫu", "sample")}</span>` : ""}</td>
      <td><span class="st" style="--c:${STATUS[s].color}">${STATUS[s].name}</span></td></tr>`; }).join("")}</table>
    ${rows.length > max ? `<p class="hint">${tx(`Hiện ${max} trên ${fmt(rows.length)} lô. Dùng bộ lọc để thu hẹp.`, `Showing ${max} of ${fmt(rows.length)} plots. Use the filters to narrow down.`)}</p>` : ""}
    ${!rows.length ? `<p class="hint">${tx("Không có lô nào khớp bộ lọc.", "No plot matches the filters.")}</p>` : ""}`;
}
["#f-level", "#f-status"].forEach((s) => ($(s).onchange = renderTable));
$("#f-q").oninput = renderTable;
document.addEventListener("click", (e) => {  // plot links anywhere outside the drawer (list, issues, field plan, report)
  const r = e.target.closest("[data-plot]");
  if (!r || r.closest("#drawer")) return;
  e.preventDefault(); flyPlot(r.dataset.plot);
});
$("#rate").onchange = (e) => { S.rate = +e.target.value; store.set("veudr:settings", { rate: S.rate }); drawSample(); refreshAll(); };
function renderNavCounts() {
  if (!S.list) { $("#nav-n").textContent = ""; $("#nav-f").textContent = ""; return; }
  const { st } = funnelNumbers();
  $("#nav-n").textContent = st("cho_xem") ? String(st("cho_xem")) : "";
  $("#nav-f").textContent = st("can_td") ? String(st("can_td")) : "";
}

// ------------------------------------------------------------------ one plot
function plotById(id) { return S.list?.plots.find((p) => p.id === id); }
function flyPlot(id) {
  const p = plotById(id); if (!p) return;
  if (S.route !== "plots" && S.route !== "field") go("plots");
  map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15) });
  openPlot(id);
}
function nearItems(lat, lon, kmMax = 3, k = 5) {
  const out = [];
  for (const f of S.items.features) {
    const q = f.properties;
    if (Math.abs(q.lat - lat) > 0.05 || Math.abs(q.lon - lon) > 0.05) continue;
    const d = km([lon, lat], [q.lon, q.lat]); if (d <= kmMax) out.push([d, q]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, k);
}
function mapsTable(p) {
  if (!p.maps) return `<p class="muted">${tx("Không có dữ liệu bản đồ cho vị trí này.", "No map data for this place.")}</p>`;
  return `<table><tr><th>${tx("Bản đồ", "Map")}</th><th class="num">${tx("Gọi là rừng 2020", "Forest in 2020")}</th></tr>
    ${MAPS.map(([k, t]) => `<tr><td>${t}</td><td class="num">${p.ncell > 1 ? pct(p.maps[k]) + tx(" điểm", " of points") : yn(p.maps[k])}</td></tr>`).join("")}
    <tr><td>${tx("Mất tán sau 2020", "Tree-cover loss after 2020")}</td><td class="num">${p.loss ? (p.lossYears.length ? tx("có, năm ", "yes, in ") + p.lossYears.join(", ") : tx("có (TMF)", "yes (TMF)")) : yn(0)}</td></tr></table>
    <p class="hint">${p.ncell > 1 ? tx(`Tính trên ${p.ncell} điểm lưới 500 m nằm trong ranh giới lô.`, `From the ${p.ncell} grid points (500 m) inside the plot outline.`)
      : tx("Lấy theo điểm lưới 500 m gần nhất, chưa phải giá trị đo trên đúng ranh giới lô: vùng mất tán nhỏ có thể bị bỏ sót.",
        "From the nearest 500 m grid point, not measured on the plot outline itself: small patches of loss can be missed.")}
      ${p.exact ? tx(" Mức ưu tiên ở trên lấy theo lô nghiên cứu trùng vị trí, đo trên đúng ranh giới.", " The priority above comes from the study plot at the same place, measured on its outline.") : ""}</p>`;
}
function openPlot(id) {
  const p = plotById(id); if (!p) return;
  S.open = { kind: "plot", id };
  map.setFilter("plot-sel", ["==", ["get", "id"], id]);
  const r = S.rev[id] || {}, s = statusOf(p), m = p.match ? itemById(p.match)?.properties : null;
  const near = nearItems(p.lat, p.lon).filter(([, q]) => q.id !== p.match);
  const reviewer = store.get("veudr:reviewer") || "";
  openDrawer(`
    <div class="kicker">${tx("Lô trong danh sách", "Plot in your list")}</div>
    <h2>${esc(p.id)}</h2>
    <div class="muted">${[p.ho, xaOf(p) + (p.xa || !p.xaAuto ? "" : tx(" (tự xác định)", " (found automatically)")), p.tinh, p.area ? fmt(p.area, 2) + " ha" : ""].filter(Boolean).map(esc).join(" · ")}
      <br>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</div>
    <div class="card"><span class="badge" style="background:${LEVEL[p.level].color}">${tx("Ưu tiên", "Priority")}: ${LEVEL[p.level].name}</span>
      ${sampled(p) ? `<span class="tag">${tx("được chọn kiểm tra ngẫu nhiên", "picked for a random check")}</span>` : ""}
      <div class="hint" style="margin-top:6px">${reasonOf(p)}</div>
      ${p.warn.length ? `<div class="warnline">⚠ ${p.warn.map((w) => esc(warnText(w))).join("<br>⚠ ")}</div>` : ""}</div>

    <h4>${tx("Bước 1 · Xem ảnh vệ tinh", "Step 1 · Check the imagery")}</h4>
    ${imageButtons()}
    ${m ? `<p class="hint">${tx("Lô trùng vị trí với lô nghiên cứu", "The plot is at the same place as study plot")} <a href="#" data-item="${m.id}">${m.id}</a>${tx(", đã có tấm bằng chứng:", ", which has an evidence sheet:")}</p>
      <img class="sheet" loading="lazy" src="sheets/${esc(m.id)}.jpg" alt="${tx(`Ảnh Sentinel-2 theo thời gian và đường NDVI của lô nghiên cứu ${esc(m.id)}`, `Sentinel-2 images over time and the NDVI curve of study plot ${esc(m.id)}`)}">
      <p class="hint">${tx("Ảnh màu thật (trên) và hồng ngoại (dưới) qua các năm. Bấm để phóng to.", "True colour (top) and infrared (bottom) over the years. Click to enlarge.")}</p>
      ${m.ref ? `<div class="hint">${tx("Nhãn tham chiếu của lô nghiên cứu", "Reference label of the study plot")}: <span class="badge v-${m.ref.verdict}">${VNAME[m.ref.verdict]}</span>
        ${LANDUSE[m.ref.land_use] ? tx(" · năm 2020: ", " · in 2020: ") + LANDUSE[m.ref.land_use] : ""}${CHANGE[m.ref.change] ? tx(" · sau đó: ", " · afterwards: ") + CHANGE[m.ref.change] : ""}</div>` : ""}`
      : `<p class="hint">${tx("Tấm bằng chứng riêng cho lô này sẽ được tạo tự động khi có máy chủ xử lý ảnh (giai đoạn 2). Hiện tại so ảnh 01/2021 với ảnh mới nhất ngay trên bản đồ, hoặc mở:",
        "An evidence sheet for this plot will be made automatically once an imagery server is in place (phase 2). For now, compare the 01/2021 and the latest imagery on the map, or open:")}</p>`}
    ${imageLinks(p.lat.toFixed(6), p.lon.toFixed(6))}
    <p class="hint">${tx("Cần trả lời hai câu: <b>ngày 31/12/2020 đất dùng vào việc gì</b> (rừng, rừng trồng, cà phê…), và <b>sau đó có thay đổi gì</b>.",
      "Two questions to answer: <b>what was the land used for on 31/12/2020</b> (forest, plantation, coffee…), and <b>what changed afterwards</b>.")}</p>

    <div id="lot-here"></div>
    <h4>${tx("Các bản đồ tại lô", "The maps at the plot")}</h4>${mapsTable(p)}

    <h4>${tx("Bước 2 · Ghi kết quả kiểm tra", "Step 2 · Record the result")}</h4>
    <div class="stbtns">${["ok_anh", "can_td", "ok_td", "van_de"].map((k) =>
      `<button data-st="${k}" class="${s === k ? "on" : ""}" style="--c:${STATUS[k].color}">${STATUS[k].name}</button>`).join("")}</div>
    <textarea id="rv-note" rows="3" placeholder="${tx("Ghi chú: thấy gì trên ảnh, giấy tờ nào, ai xác nhận…", "Notes: what the imagery shows, which documents, who confirmed…")}">${esc(r.note || "")}</textarea>
    <div class="row2"><input id="rv-by" placeholder="${tx("Người kiểm tra", "Checked by")}" value="${esc(reviewer)}"><button id="rv-save" class="btn">${tx("Lưu", "Save")}</button></div>
    <p class="hint">${tx("Trạng thái hiện tại", "Current status")}: <b>${STATUS[s].name}</b>${r.history?.length ? "" : tx(" (mặc định theo mức ưu tiên)", " (default for the priority level)")}.
      ${tx("Lưu trong trình duyệt này. Hãy xuất tệp ở trang Báo cáo để lưu lâu dài.", "Saved in this browser. Export a file on the Report page to keep it.")}</p>
    ${r.history?.length ? `<table class="hist">${r.history.slice().reverse().map((h) => `<tr><td>${dt(h.t)}</td>
      <td>${STATUS[h.status]?.name || ""}</td><td>${esc(h.by)}</td><td>${esc(h.note)}</td></tr>`).join("")}</table>` : ""}

    ${near.length ? `<h4>${tx("Lô nghiên cứu gần đây (trong 3 km)", "Study plots nearby (within 3 km)")}</h4><table>${near.map(([d, q]) => `<tr><td><a href="#" data-item="${q.id}">${q.id}</a></td>
      <td>${fmt(d, 1)} km</td><td>${q.ref ? `<span class="badge v-${q.ref.verdict}">${VNAME[q.ref.verdict]}</span>` : `<span class="muted">${tx("chưa có nhãn", "no label")}</span>`}</td></tr>`).join("")}</table>` : ""}
    <div class="btns"><button id="rv-print" class="ghost">${tx("In hồ sơ lô này", "Print this plot's dossier")}</button></div>`);
  fillLotHere(p.lon, p.lat);
  let chosen = S.rev[id]?.status || null;
  document.querySelectorAll(".stbtns button").forEach((b) => (b.onclick = () => {
    chosen = b.dataset.st; document.querySelectorAll(".stbtns button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  $("#rv-save").onclick = () => {
    const note = $("#rv-note").value.trim(), by = $("#rv-by").value.trim();
    if (!chosen) { $("#rv-note").focus(); $("#rv-note").placeholder = tx("Chọn một kết quả ở trên trước khi lưu", "Choose a result above before saving"); return; }
    store.set("veudr:reviewer", by);
    const rec = S.rev[id] || { history: [] };
    const lots = lotsAt(p.lon, p.lat);
    rec.status = chosen; rec.note = note; rec.by = by; rec.t = Date.now();
    if (lots && lots.length) rec.lot = lots[0];
    rec.history = [...(rec.history || []), { t: rec.t, status: chosen, note, by }];
    S.rev[id] = rec; saveRev();
    refreshAll(); openPlot(id);
  };
  $("#rv-print").onclick = () => printDossier([p]);
}

// ------------------------------------------------------------------ field plan
function fieldPlots() {
  const incl = $("#f-incl").checked;
  return S.list ? S.list.plots.filter((p) => { const s = statusOf(p); return s === "can_td" || (incl && p.level === "cao" && s === "cho_xem"); }) : [];
}
function routeOf(ps) {  // nearest neighbour from the northernmost plot
  const left = ps.slice().sort((a, b) => b.lat - a.lat), out = [left.shift()];
  let dist = 0;
  while (left.length) {
    const last = out[out.length - 1];
    let bi = 0, bd = Infinity;
    left.forEach((p, i) => { const d = km([last.lon, last.lat], [p.lon, p.lat]); if (d < bd) { bd = d; bi = i; } });
    dist += bd; out.push(left.splice(bi, 1)[0]);
  }
  return { order: out, km: dist };
}
function fieldGroups() {
  const g = new Map();
  for (const p of fieldPlots()) { const k = xaOf(p) + (p.tinh ? " · " + p.tinh : ""); if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  return [...g.entries()].map(([k, ps]) => ({ name: k, ...routeOf(ps) })).sort((a, b) => b.order.length - a.order.length);
}
function renderField() {
  const out = $("#field");
  if (!S.list) { out.innerHTML = `<p class="muted">${tx('Chưa có danh sách lô. Tải lên ở trang <a href="#/danh-sach">Danh sách lô</a>.', 'No plot list yet. Upload one on the <a href="#/danh-sach">Plot list</a> page.')}</p>`; drawRoutes([]); return; }
  const gs = fieldGroups(), n = gs.reduce((s, g) => s + g.order.length, 0);
  drawRoutes(gs);
  if (!gs.length) { out.innerHTML = `<p class="muted">${tx('Chưa có lô nào cần thực địa. Đánh dấu "Cần thực địa" trong hồ sơ lô sau khi xem ảnh.', 'No plot needs a field visit yet. Mark "Field visit needed" in a plot\'s dossier after the image check.')}</p>`; return; }
  out.innerHTML = `<p>${tx(`<b>${fmt(n)}</b> lô ở <b>${gs.length}</b> xã.`, `<b>${fmt(n)}</b> plots in <b>${gs.length}</b> communes.`)}</p>
    ${gs.map((g, i) => `<div class="card grp"><div class="row"><b>${esc(g.name)}</b><button class="link" data-grp="${i}">${tx("Xem", "Show")}</button></div>
      <div class="hint">${tx(`${g.order.length} lô · đường đi giữa các lô khoảng ${fmt(g.km, 1)} km (đường chim bay)`, `${g.order.length} plots · about ${fmt(g.km, 1)} km between them (straight line)`)}</div>
      <ol class="stops">${g.order.map((p) => `<li><a href="#" data-plot="${esc(p.id)}">${esc(p.id)}</a>${p.ho ? " · " + esc(p.ho) : ""}
        <span class="st" style="--c:${STATUS[statusOf(p)].color}">${STATUS[statusOf(p)].name}</span></li>`).join("")}</ol></div>`).join("")}
    <div class="btns wrap"><button id="btn-gpx" class="ghost">${tx("Tải GPX cho điện thoại", "Download GPX for a phone")}</button><button id="btn-fcsv" class="ghost">${tx("Tải danh sách (.csv)", "Download the list (.csv)")}</button></div>`;
  out.querySelectorAll("[data-grp]").forEach((b) => (b.onclick = () => {
    const ps = gs[+b.dataset.grp].order, lons = ps.map((p) => p.lon), lats = ps.map((p) => p.lat);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 15 });
  }));
  $("#btn-gpx").onclick = () => download(tx("ke_hoach_thuc_dia.gpx", "field_plan.gpx"), gpx(gs), "application/gpx+xml");
  $("#btn-fcsv").onclick = () => download(tx("ke_hoach_thuc_dia.csv", "field_plan.csv"), fieldCSV(gs), "text/csv");
}
const fieldCSV = (gs) => toCSV(gs.flatMap((g) => g.order.map((p, i) => (LANG === "en"
  ? { commune: g.name, stop: i + 1, plot_id: p.id, farmer: p.ho, latitude: p.lat.toFixed(6), longitude: p.lon.toFixed(6), priority: LEVEL[p.level].name, status: STATUS[statusOf(p)].name, notes: S.rev[p.id]?.note || "" }
  : { xa: g.name, thu_tu: i + 1, ma_lo: p.id, ho_dan: p.ho, vi_do: p.lat.toFixed(6), kinh_do: p.lon.toFixed(6), muc_uu_tien: LEVEL[p.level].name, trang_thai: STATUS[statusOf(p)].name, ghi_chu: S.rev[p.id]?.note || "" }))));
$("#f-incl").onchange = () => { renderField(); renderNavCounts(); };
function drawRoutes(gs) {
  const fc = { type: "FeatureCollection", features: gs.flatMap((g) => [
    ...(g.order.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: g.order.map((p) => [p.lon, p.lat]) } }] : []),
    ...g.order.map((p, i) => ({ type: "Feature", properties: { n: String(i + 1) }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }))]) };
  if (map.getSource("route")) { map.getSource("route").setData(fc); return; }
  if (!gs.length || !map.getLayer("plots")) return;
  map.addSource("route", { type: "geojson", data: fc });
  map.addLayer({ id: "route", type: "line", source: "route", filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": "#111", "line-width": 2, "line-dasharray": [2, 1.5] } }, "plots");
  map.addLayer({ id: "route-num", type: "symbol", source: "route", filter: ["==", ["geometry-type"], "Point"], minzoom: 10,
    layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, -1.3], "text-allow-overlap": true },
    paint: { "text-color": "#111", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
}

// ------------------------------------------------------------------ exports
function download(fn, text, type) {
  const a = Object.assign(document.createElement("a"), { download: fn, href: URL.createObjectURL(new Blob(["﻿" + text], { type })) });
  document.body.appendChild(a); a.click(); a.remove();
}
function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]), q = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n");
}
// column names follow the language of the page; the values are the same either way
const RESULT_COLS = [["ma_lo", "plot_id"], ["ho_dan", "farmer"], ["xa", "commune"], ["xa_tu_dong", "commune_auto"], ["tinh", "province"],
  ["vi_do", "latitude"], ["kinh_do", "longitude"], ["dien_tich_ha", "area_ha"], ["muc_uu_tien", "priority"], ["ly_do", "reason"],
  ["kiem_tra_ngau_nhien", "random_check"], ["trang_thai", "status"], ["ghi_chu", "notes"], ["nguoi_kiem_tra", "checked_by"], ["thoi_gian", "checked_at"],
  ["canh_bao_du_lieu", "data_warnings"], ["gfc2020_v1", "gfc2020_v1"], ["gfc2020_v4", "gfc2020_v4"], ["jrc_tmf", "jrc_tmf"], ["hansen", "hansen"],
  ["worldcover", "worldcover"], ["ban_do_quoc_gia_2020", "national_map_2020"], ["mat_tan_sau_2020", "loss_after_2020"], ["nam_mat_tan", "loss_years"],
  ["lo_rung_2020_tk_khoanh_lo", "forest_lot_2020_subc_comp_lot"], ["lo_rung_2020_ldlr", "forest_lot_2020_type"], ["lo_nghien_cuu_trung", "matching_study_plot"]];
function resultRows() {
  const f2 = (x) => (x == null ? "" : x.toFixed(2)), col = LANG === "en" ? 1 : 0;
  return S.list.plots.map((p) => {
    const r = S.rev[p.id] || {};
    const v = [p.id, p.ho, p.xa, p.xaAuto, p.tinh, p.lat.toFixed(6), p.lon.toFixed(6), f2(p.area), LEVEL[p.level].name, reasonOf(p),
      sampled(p) ? tx("có", "yes") : "", STATUS[statusOf(p)].name, r.note || "", r.by || "", r.t ? new Date(r.t).toISOString() : "",
      p.warn.map(warnText).join("; "), f2(p.maps?.gfcV1), f2(p.maps?.gfcV4), f2(p.maps?.tmf), f2(p.maps?.han), f2(p.maps?.wc),
      offText(p), f2(p.loss), (p.lossYears || []).join(" "), r.lot ? `${r.lot.tk ?? ""}/${r.lot.kh ?? ""}/${r.lot.lo ?? ""}` : "", r.lot?.ldlr || "", p.match || ""];
    return Object.fromEntries(RESULT_COLS.map((c, i) => [c[col], v[i]]));
  });
}
function gpx(gs) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="vEUDR" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    gs.flatMap((g) => g.order.map((p, i) => `<wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${esc(p.id)}</name>` +
      `<desc>${esc(g.name)} · ${tx("điểm", "stop")} ${i + 1} · ${esc(LEVEL[p.level].name)}${p.ho ? " · " + esc(p.ho) : ""}</desc></wpt>`)).join("\n") +
    "\n" + gs.filter((g) => g.order.length > 1).map((g) => `<rte><name>${esc(g.name)}</name>${g.order.map((p) =>
      `<rtept lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><name>${esc(p.id)}</name></rtept>`).join("")}</rte>`).join("\n") + "\n</gpx>\n";
}
function dossierHTML(ps) {
  const base = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, ""), now = dt(Date.now());
  const one = (p) => {
    const r = S.rev[p.id] || {}, m = p.match ? itemById(p.match)?.properties : null;
    return `<section><h2>${tx("Hồ sơ sàng lọc EUDR · lô", "EUDR screening dossier · plot")} ${esc(p.id)}</h2>
      <table><tr><th>${tx("Mã lô", "Plot code")}</th><td>${esc(p.id)}</td><th>${tx("Hộ / chủ lô", "Farmer / owner")}</th><td>${esc(p.ho) || "–"}</td></tr>
        <tr><th>${tx("Xã", "Commune")}</th><td>${esc(xaOf(p))}${p.tinh ? ", " + esc(p.tinh) : ""}</td><th>${tx("Diện tích", "Area")}</th><td>${p.area ? fmt(p.area, 2) + " ha" : "–"}</td></tr>
        <tr><th>${tx("Tọa độ", "Coordinates")}</th><td colspan="3">${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}${p.geom ? tx(" (tâm của ranh giới đa giác)", " (centre of the polygon)") : tx(" (điểm)", " (point)")}</td></tr></table>
      <h3>${tx("Kết quả sàng lọc", "Screening result")}</h3>
      <p><b>${tx("Mức ưu tiên", "Priority")}: ${LEVEL[p.level].name}</b>${sampled(p) ? tx(" · được chọn kiểm tra ngẫu nhiên", " · picked for a random check") : ""}. ${esc(reasonOf(p))}</p>
      ${p.warn.length ? `<p>${tx("Cảnh báo dữ liệu", "Data warnings")}: ${p.warn.map((w) => esc(warnText(w))).join("; ")}</p>` : ""}
      ${p.maps ? `<table><tr><th>${tx("Bản đồ (năm 2020)", "Map (2020)")}</th><th>${tx("Gọi là rừng", "Calls it forest")}</th></tr>${MAPS.map(([k, t]) => `<tr><td>${t}</td><td>${pct(p.maps[k])}</td></tr>`).join("")}
        <tr><td>${tx("Mất tán sau 2020 (Hansen / JRC TMF)", "Tree-cover loss after 2020 (Hansen / JRC TMF)")}</td><td>${pct(p.loss)}${p.lossYears.length ? tx(" · năm ", " · in ") + p.lossYears.join(", ") : ""}</td></tr></table>` : ""}
      ${r.lot ? `<h3>${tx("Lô rừng 2020 tại vị trí lô", "2020 forest lot at the plot")} (${SRC_VNF})</h3>
        <p>${tx("Tiểu khu", "Sub-compartment")} ${esc(r.lot.tk ?? "–")}, ${tx("khoảnh", "compartment")} ${esc(r.lot.kh ?? "–")}, ${tx("lô", "lot")} ${esc(r.lot.lo ?? "–")} · ${esc(r.lot.ldlr || "")} ${esc(LDLR[r.lot.ldlr] || "")} ·
          ${LOT_CLS[r.lot.cls]?.[1] || ""} · ${LOT_QH[r.lot.qh]?.[1] || ""}${r.lot.cr ? tx(" · chủ rừng: ", " · forest owner: ") + esc(r.lot.cr) : ""}</p>` : ""}
      <h3>${tx("Kết quả kiểm tra", "Check result")}</h3>
      <p><b>${STATUS[statusOf(p)].name}</b>${r.by ? " · " + esc(r.by) : ""}${r.t ? " · " + dt(r.t) : ""}</p>
      ${r.note ? `<p>${tx("Ghi chú", "Notes")}: ${esc(r.note)}</p>` : ""}
      ${r.history?.length > 1 ? `<table><tr><th>${tx("Thời gian", "Time")}</th><th>${tx("Kết quả", "Result")}</th><th>${tx("Người", "By")}</th><th>${tx("Ghi chú", "Notes")}</th></tr>${r.history.map((h) =>
        `<tr><td>${dt(h.t)}</td><td>${STATUS[h.status]?.name || ""}</td><td>${esc(h.by)}</td><td>${esc(h.note)}</td></tr>`).join("")}</table>` : ""}
      <h3>${tx("Bằng chứng", "Evidence")}</h3>
      ${m ? `<p>${tx(`Tấm ảnh Sentinel-2 của lô nghiên cứu ${m.id} trùng vị trí:`, `Sentinel-2 sheet of study plot ${m.id} at the same place:`)}</p><img src="${base}sheets/${m.id}.jpg" alt="">` : `<p>${tx("Ảnh lịch sử tại tọa độ lô:", "Archive imagery at the plot coordinates:")}</p>`}
      <p class="links">Esri Wayback: https://livingatlas.arcgis.com/wayback/#mapCenter=${p.lon.toFixed(6)}%2C${p.lat.toFixed(6)}%2C17<br>
        Copernicus Browser: https://browser.dataspace.copernicus.eu/?zoom=15&lat=${p.lat.toFixed(6)}&lng=${p.lon.toFixed(6)}</p></section>`;
  };
  return `<!doctype html><html lang="${LANG}"><head><meta charset="utf-8"><title>${tx("Hồ sơ sàng lọc EUDR", "EUDR screening dossier")}</title><style>
    body{font:12px/1.45 system-ui,sans-serif;color:#111;margin:24px} h2{font-size:16px;margin:0 0 8px} h3{font-size:13px;margin:14px 0 4px}
    table{border-collapse:collapse;width:100%;margin:4px 0} th,td{border:1px solid #ccc;padding:3px 6px;text-align:left;vertical-align:top} th{background:#f3f3f3}
    img{width:100%;border:1px solid #ccc} section{page-break-after:always} .links{word-break:break-all;color:#333}
    footer{color:#555;font-size:11px;border-top:1px solid #ccc;padding-top:6px}</style></head><body>
    ${ps.map(one).join("")}
    <footer>${tx(`Lập ngày ${now} bằng vEUDR (bản thử). Sàng lọc dựa trên các bản đồ mở (JRC GFC2020 V1–V4, JRC TMF, Hansen/UMD GFC, ESA WorldCover) và ${SRC_VNF},
      trên lưới mẫu 500 m. Đây là công cụ hỗ trợ chọn lô cần kiểm tra, không phải kết luận pháp lý hay chứng nhận tuân thủ Quy định (EU) 2023/1115.`,
      `Made on ${now} with vEUDR (beta). Screening from open maps (JRC GFC2020 V1–V4, JRC TMF, Hansen/UMD GFC, ESA WorldCover) and the ${SRC_VNF},
      on a 500 m sample grid. This is a tool to choose which plots to check, not a legal finding or a certificate of compliance with Regulation (EU) 2023/1115.`)}</footer>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
}
function printDossier(ps) {
  const w = window.open("", "_blank");
  if (!w) { alert(tx("Trình duyệt chặn cửa sổ mới. Hãy cho phép cửa sổ bật lên để in hồ sơ.", "The browser blocked the new window. Allow pop-ups to print the dossier.")); return; }
  w.document.write(dossierHTML(ps)); w.document.close();
}

// ------------------------------------------------------------------ upload, sample, resume
$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { loadList(f.name, await f.text()); }
  catch (err) { $("#resume").innerHTML = `<div class="card">${tx("Không đọc được tệp", "Could not read the file")}: ${esc(err.message)}</div>`; }
  e.target.value = "";
};
async function loadSample() { loadList("__sample__", await (await fetch("data/danh_sach_lo_mau.csv")).text()); }
$("#btn-sample").onclick = loadSample;
$("#btn-clear").onclick = () => {
  S.list = null; S.rev = {}; store.del("veudr:last"); removePlots(); closeDrawer();
  $("#plots-loaded").hidden = true; $("#plots-empty").hidden = false;
  setItemsVisible(true); renderField(); renderResume(); renderNavCounts();
};
function renderResume() {
  const last = store.get("veudr:last");
  $("#resume").innerHTML = last ? `<div class="card">${tx("Danh sách lần trước", "Previous list")}: <b>${esc(listTitle(last.name))}</b>
    <div class="btns"><button id="btn-resume" class="btn">${tx("Mở lại", "Reopen")}</button></div></div>` : "";
  if (last) $("#btn-resume").onclick = () => loadList(last.name, last.text, false);
}

// ------------------------------------------------------------------ map clicks
map.on("click", (e) => {
  const layers = ["plots", "items-pt", "items-fill"].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
  const hit = map.queryRenderedFeatures(e.point, { layers });
  const pl = hit.find((h) => h.layer.id === "plots");
  if (pl) { openPlot(pl.properties.id); return; }
  if (hit.length) { openItem(hit[0].properties.id); return; }
  if ($("#t-lots").checked && map.getZoom() >= 11) {
    const lot = map.queryRenderedFeatures(e.point, { layers: ["lots-hit"] })[0];
    if (lot) { openLot(lot.properties, e.lngLat); return; }
  }
  const v = S.grid && cell(e.lngLat.lng, e.lngLat.lat);
  if (!v) return;
  const c = communeAt(e.lngLat.lng, e.lngLat.lat);
  new maplibregl.Popup({ maxWidth: "300px" }).setLngLat(e.lngLat).setHTML(
    `<span class="badge b${v.tier}">${TIER[v.tier].name}</span>
     <div class="muted" style="margin:4px 0">${tx("Điểm lưới 500 m gần nhất", "Nearest 500 m grid point")}${c ? " · " + esc(c.xa) : ""}</div>
     <table>${MAPS.map(([k, t]) => `<tr><td>${t}</td><td>${k === "off" ? (OFFC[v.offc]?.[1] || tx("ngoài lô", "outside lots")) : yn(v[k])}</td></tr>`).join("")}
     <tr><td>${tx("Mất tán sau 2020", "Tree-cover loss after 2020")}</td><td>${v.loss ? (v.lossyear ? tx("có, năm 20", "yes, in 20") + v.lossyear : tx("có (TMF)", "yes (TMF)")) : yn(0)}</td></tr></table>`).addTo(map);
});
for (const l of ["plots", "items-pt", "items-fill", "lots-hit"]) {
  map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
}

// ------------------------------------------------------------------ document pages
function renderStats() {
  const st = S.meta.grid.stats[$("#prov").value], n = st.points;
  $("#stats").innerHTML = `<div class="bar">${[3, 2, 1, 0].map((k) => `<span style="width:${100 * st.tier[k] / n}%;background:${TIER[k].color}"></span>`).join("")}</div>
    <table><tr><th>${tx("Lớp lưới", "Grid class")}</th><th class="num">${tx("Diện tích", "Area")}</th><th class="num">${tx("Tỷ lệ", "Share")}</th></tr>
    ${[3, 2, 1, 0].map((k) => `<tr><td><span class="sw" style="background:${TIER[k].color}"></span> ${TIER[k].name}</td>
      <td class="num">${fmt(st.tier[k] * HA_PER_POINT)} ha</td><td class="num">${pct(st.tier[k] / n)}</td></tr>`).join("")}</table>
    <p class="hint">${tx(`Bản đồ hiện trạng rừng 2020 ghi là rừng ${fmt(st.off_forest * HA_PER_POINT)} ha. GFC2020 V1 gọi là rừng ${fmt(st.v1 * HA_PER_POINT)} ha,
      V4 chỉ còn ${fmt(st.v4 * HA_PER_POINT)} ha. Mỗi điểm lưới đại diện 25 ha.`,
      `The 2020 forest-status map records ${fmt(st.off_forest * HA_PER_POINT)} ha of forest. GFC2020 V1 calls ${fmt(st.v1 * HA_PER_POINT)} ha forest,
      V4 only ${fmt(st.v4 * HA_PER_POINT)} ha. Each grid point stands for 25 ha.`)}</p>`;
}
function tierTable() {
  const tv = S.meta.tier_vs_ref;
  const row = (k) => { const d = tv[k] || {}, n = Object.values(d).reduce((a, b) => a + b, 0);
    return `<tr><td><span class="sw" style="background:${TIER[k].color}"></span> ${TIER[k].name}</td><td class="num">${n}</td>
      <td class="num">${n ? pct((d.non_compliant || 0) / n) : "–"}</td><td class="num">${n ? pct((d.undetermined || 0) / n) : "–"}</td>
      <td class="num">${n ? pct((d.compliant || 0) / n) : "–"}</td></tr>`; };
  return `<table><tr><th>${tx("Mức", "Level")}</th><th class="num">${tx("Số lô", "Plots")}</th><th class="num">${tx("Không tuân thủ", "Non-compliant")}</th>
    <th class="num">${tx("Chưa xác định", "Undetermined")}</th><th class="num">${tx("Tuân thủ", "Compliant")}</th></tr>
    ${[3, 2, 1, 0].map(row).join("")}</table>`;
}
function renderHome() {
  const st = S.meta.grid.stats.all, tv = S.meta.tier_vs_ref, nc = Object.values(tv).reduce((a, d) => a + (d.non_compliant || 0), 0);
  $("#page-home").innerHTML = `<div class="doc">
    <div class="hero">
      <h1>${tx("Biết lô nào cần kiểm tra,<br>bỏ qua lô không cần", "Know which plots to check,<br>skip the ones you don't need to")}</h1>
      <p class="lead">${tx("Công cụ sàng lọc EUDR cho doanh nghiệp cà phê Tây Nguyên. Từ hàng nghìn lô của nông hộ, chỉ ra vài trăm lô cần xem ảnh và vài chục lô cần đi thực địa, kèm sẵn bằng chứng vệ tinh cho từng lô.",
        "An EUDR screening tool for coffee businesses in Vietnam's Central Highlands. Out of thousands of farmers' plots, it points to the few hundred to check on imagery and the few dozen that need a field visit, with satellite evidence for each plot.")}</p>
      <div class="btns"><a class="btn big" href="#/danh-sach">${tx("Bắt đầu với danh sách lô", "Start with your plot list")}</a><a class="btn ghost big" href="#/ban-do">${tx("Xem bản đồ", "Open the map")}</a></div>
    </div>
    <h2>${tx("Vấn đề của doanh nghiệp", "The problem for businesses")}</h2>
    <p>${tx(`Từ cuối năm 2026, cà phê xuất sang EU phải chứng minh không đến từ đất bị phá rừng sau ngày 31/12/2020. Doanh nghiệp có hàng nghìn lô đất của nông hộ.
      Kiểm tra tất cả thì quá tốn kém. Còn dựa vào bản đồ có sẵn thì mỗi bản đồ cho một kết quả: cùng một mẫu lô cà phê, GFC2020 phiên bản 1 gọi 78% là rừng năm 2020,
      phiên bản 4 chỉ 22%, trong khi người xem ảnh thấy 50%. Rất dễ loại oan lô sạch, hoặc để lọt lô có vấn đề.`,
      `From the end of 2026, coffee sold to the EU must be shown not to come from land deforested after 31 December 2020. A business sources from thousands of farmers' plots.
      Checking them all costs too much. Relying on existing maps gives a different answer for each map: on the same sample of coffee plots, GFC2020 version 1 calls 78% forest in 2020,
      version 4 only 22%, while people reading the imagery see 50%. It is easy to exclude clean plots by mistake, or to let problem plots through.`)}</p>
    <h2>${tx("Trang này giúp gì", "How this site helps")}</h2>
    <div class="steps4">
      <a href="#/danh-sach"><b>1</b><h3>${tx("Tải lên danh sách lô", "Upload the plot list")}</h3><p>${tx("CSV hoặc GeoJSON. Nhận ngay mức ưu tiên Cao, Trung bình, Thấp cho từng lô, kèm kiểm tra lỗi dữ liệu và xã của lô.",
        "CSV or GeoJSON. Get a High, Medium or Low priority for every plot at once, with data checks and each plot's commune.")}</p></a>
      <a href="#/danh-sach"><b>2</b><h3>${tx("Xem ảnh tại văn phòng", "Check imagery at the office")}</h3><p>${tx("Chỉ xem lô mức Cao và một mẫu ngẫu nhiên nhỏ. Có ảnh vệ tinh tháng 01/2021 và ảnh mới nhất, cùng lô rừng 2020 tại vị trí lô.",
        "Look only at High plots and a small random sample. Imagery from 01/2021 and the latest, plus the 2020 forest lot at each plot.")}</p></a>
      <a href="#/thuc-dia"><b>3</b><h3>${tx("Đi thực địa có kế hoạch", "Plan the field visits")}</h3><p>${tx("Chỉ những lô vẫn chưa rõ, gom theo xã, sắp theo thứ tự đi gần nhất, tải về điện thoại.",
        "Only the plots still unclear, grouped by commune, ordered by the nearest next stop, downloadable to a phone.")}</p></a>
      <a href="#/bao-cao"><b>4</b><h3>${tx("Lưu hồ sơ", "Keep the records")}</h3><p>${tx("Xuất kết quả và in hồ sơ từng lô cho đối tác EU khi được yêu cầu thẩm định.",
        "Export the results and print a dossier per plot for EU buyers when they ask for due diligence.")}</p></a>
    </div>
    <h2>${tx("Con số từ nghiên cứu", "Numbers from the study")}</h2>
    <div class="kpis">
      <div><b>${nc}/${nc}</b><span>${tx("lô không tuân thủ trong mẫu nghiên cứu đều nằm ở mức Cao", "non-compliant plots of the study sample are all ranked High")}</span></div>
      <div><b>78% → 22%</b><span>${tx("lô cà phê bị gọi là rừng 2020: GFC2020 V1 so với V4", "of coffee plots called forest in 2020: GFC2020 V1 vs V4")}</span></div>
      <div><b>${fmt(st.points * HA_PER_POINT / 1e6, 2)} ${tx("triệu ha", "million ha")}</b><span>${tx("được sàng lọc trên 5 tỉnh, lưới 500 m", "screened across 5 provinces on a 500 m grid")}</span></div>
      <div><b>${fmt(st.off_forest * HA_PER_POINT / 1e6, 2)} ${tx("triệu ha", "million ha")}</b><span>${tx("là rừng năm 2020 theo bản đồ diễn biến rừng (tnr.vnforest.gov.vn)", "of forest in 2020 on the forest-status map (tnr.vnforest.gov.vn)")}</span></div>
    </div>
    <h2>${tx("Trang này không làm gì", "What this site does not do")}</h2>
    <p>${tx(`Không cấp chứng nhận "tuân thủ" và không thuộc hệ thống chính thức nào. Trang chỉ ra <b>cần kiểm tra ở đâu</b> và đưa sẵn bằng chứng. Kết luận cuối cùng vẫn do người xác minh đưa ra.
      Xem <a href="#/phuong-phap">cách tính</a> và <a href="#/du-lieu">nguồn dữ liệu</a>.`,
      `It does not certify compliance and is not part of any official system. It shows <b>where to check</b> and supplies the evidence; the final decision is made by the person who verifies.
      See <a href="#/phuong-phap">how it works</a> and <a href="#/du-lieu">the data sources</a>.`)}</p>
  </div>`;
}
function renderReport() {
  const el = $("#page-report");
  if (!S.list) { el.innerHTML = `<div class="doc"><h1>${tx("Báo cáo", "Report")}</h1><p>${tx('Chưa có danh sách lô. <a href="#/danh-sach">Tải lên danh sách lô</a> để xem tổng hợp, xuất kết quả và in hồ sơ.',
    'No plot list yet. <a href="#/danh-sach">Upload a plot list</a> to see summaries, export results and print dossiers.')}</p></div>`; return; }
  const L = S.list, { c, st, n, review, field } = funnelNumbers(), done = st("ok_anh") + st("ok_td") + st("van_de");
  const byXa = new Map();
  for (const p of L.plots) {
    const k = xaOf(p) + (p.tinh ? " · " + p.tinh : "");
    const r = byXa.get(k) || { n: 0, cao: 0, tb: 0, thap: 0, off: 0, td: 0, vd: 0 };
    r.n++; if (r[p.level] != null) r[p.level]++; if (p.offc && p.offc[0] + p.offc[1] > 0) r.off++;
    const s = statusOf(p); if (s === "can_td") r.td++; if (s === "van_de") r.vd++;
    byXa.set(k, r);
  }
  const xa = [...byXa.entries()].sort((a, b) => b[1].cao - a[1].cao || b[1].n - a[1].n);
  const problems = L.plots.filter((p) => statusOf(p) === "van_de");
  el.innerHTML = `<div class="doc wide">
    <h1>${tx("Báo cáo", "Report")} · ${esc(listTitle(L.name))}</h1>
    <p class="muted">${tx("Lập lúc", "Made at")} ${dt(Date.now())} · ${tx(`kiểm tra ngẫu nhiên ${pct(S.rate)} lô mức Trung bình và Thấp`, `random check of ${pct(S.rate)} of Medium and Low plots`)}</p>
    <div class="kpis k6">
      <div><b>${fmt(n)}</b><span>${tx("lô trong danh sách", "plots in the list")}</span></div>
      <div><b>${fmt(review)}</b><span>${tx("cần xem ảnh", "to check on imagery")} (${pct(review / n)})</span></div>
      <div><b>${fmt(done)}</b><span>${tx("đã có kết quả kiểm tra", "with a check result")}</span></div>
      <div><b>${fmt(field)}</b><span>${tx("cần hoặc đã thực địa", "needing or after a field visit")}</span></div>
      <div><b>${fmt(st("van_de"))}</b><span>${tx("có vấn đề", "with a problem")}</span></div>
      <div><b>${fmt(L.plots.filter((p) => p.offc && p.offc[0] + p.offc[1] > 0).length)}</b><span>${tx("lô chạm lô rừng 2020 của bản đồ quốc gia", "plots touching a 2020 forest lot of the national map")}</span></div>
    </div>
    <h2>${tx("Tiến độ xem ảnh", "Image-check progress")}</h2>
    <div class="bar big"><span style="width:${100 * done / Math.max(review, 1)}%;background:#2166ac"></span></div>
    <p class="hint">${tx(`${fmt(done)} trên ${fmt(review)} lô trong hàng đợi đã có kết quả.`, `${fmt(done)} of the ${fmt(review)} queued plots have a result.`)}</p>
    <h2>${tx("Theo mức ưu tiên", "By priority")}</h2>
    <table class="rep"><tr><th>${tx("Mức", "Level")}</th><th class="num">${tx("Số lô", "Plots")}</th><th class="num">${tx("Tỷ lệ", "Share")}</th></tr>
      ${Object.entries(LEVEL).filter(([k]) => c.level[k]).map(([k, v]) => `<tr><td><span class="sw" style="background:${v.color}"></span> ${v.name}</td><td class="num">${fmt(c.level[k])}</td><td class="num">${pct(c.level[k] / n)}</td></tr>`).join("")}</table>
    <h2>${tx("Theo xã", "By commune")}</h2>
    <div class="scroll"><table class="rep"><tr><th>${tx("Xã", "Commune")}</th><th class="num">${tx("Số lô", "Plots")}</th><th class="num">${LEVEL.cao.name}</th><th class="num">${LEVEL.tb.name}</th><th class="num">${LEVEL.thap.name}</th>
      <th class="num">${tx("Chạm lô rừng 2020", "On a 2020 forest lot")}</th><th class="num">${STATUS.can_td.name}</th><th class="num">${STATUS.van_de.name}</th></tr>
      ${xa.map(([k, r]) => `<tr><td>${esc(k)}</td><td class="num">${r.n}</td><td class="num">${r.cao || ""}</td><td class="num">${r.tb || ""}</td><td class="num">${r.thap || ""}</td>
        <td class="num">${r.off || ""}</td><td class="num">${r.td || ""}</td><td class="num">${r.vd || ""}</td></tr>`).join("")}</table></div>
    ${problems.length ? `<h2>${tx("Lô có vấn đề", "Plots with a problem")}</h2><ul>${problems.map((p) => `<li><a href="#" data-plot="${esc(p.id)}">${esc(p.id)}</a> · ${esc(xaOf(p))} · ${esc(S.rev[p.id]?.note || "")}</li>`).join("")}</ul>` : ""}
    ${L.skipped.length || L.plots.some((p) => p.warn.length) ? `<h2>${tx("Lỗi dữ liệu cần sửa trong tệp gốc", "Data errors to fix in the source file")}</h2><ul>
      ${L.skipped.map((s) => `<li>${tx("Dòng", "Row")} ${s.line}${s.id ? ` (${esc(s.id)})` : ""}: ${esc(warnText(s.why))}</li>`).join("")}
      ${L.plots.filter((p) => p.warn.length).map((p) => `<li><a href="#" data-plot="${esc(p.id)}">${esc(p.id)}</a>: ${p.warn.map((w) => esc(warnText(w))).join("; ")}</li>`).join("")}</ul>` : ""}
    <h2>${tx("Xuất tệp", "Exports")}</h2>
    <div class="btns wrap">
      <button class="btn" id="r-csv">${tx("Kết quả toàn bộ danh sách (.csv)", "Results for the whole list (.csv)")}</button>
      <button class="btn ghost" id="r-print">${tx("In hồ sơ các lô đã kiểm tra", "Print dossiers of checked plots")}</button>
      <button class="btn ghost" id="r-print-cao">${tx("In hồ sơ mọi lô mức Cao", "Print dossiers of all High plots")}</button>
      <button class="btn ghost" id="r-gpx">${tx("Kế hoạch thực địa (.gpx)", "Field plan (.gpx)")}</button>
    </div>
    <p class="hint">${tx("Kết quả kiểm tra hiện chỉ lưu trong trình duyệt này. Hãy xuất tệp CSV định kỳ để lưu trữ.", "Check results are kept only in this browser. Export the CSV regularly to keep a record.")}</p></div>`;
  $("#r-csv").onclick = () => download(`${tx("ket_qua_sang_loc", "screening_results")}_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(resultRows()), "text/csv");
  $("#r-print").onclick = () => { const ps = L.plots.filter((p) => S.rev[p.id]?.status); if (!ps.length) alert(tx("Chưa có lô nào được ghi kết quả kiểm tra.", "No plot has a check result yet.")); else printDossier(ps); };
  $("#r-print-cao").onclick = () => printDossier(L.plots.filter((p) => p.level === "cao"));
  $("#r-gpx").onclick = () => { const gs = fieldGroups(); if (!gs.length) alert(tx("Chưa có lô nào cần thực địa.", "No plot needs a field visit yet.")); else download(tx("ke_hoach_thuc_dia.gpx", "field_plan.gpx"), gpx(gs), "application/gpx+xml"); };
}
function renderMethod() {
  const tv = S.meta.tier_vs_ref, nc = Object.values(tv).reduce((a, d) => a + (d.non_compliant || 0), 0), nc3 = tv[3]?.non_compliant || 0;
  $("#page-method").innerHTML = `<div class="doc">
    <h1>${tx("Phương pháp", "Method")}</h1>
    <h2>${tx("Mức ưu tiên được tính thế nào", "How the priority is set")}</h2>
    <p>${tx(`Trên 5 tỉnh Tây Nguyên (ranh giới trước sáp nhập), một lưới điểm cách nhau 500 m (218.401 điểm) lấy giá trị của các bản đồ năm 2020 và của dữ liệu mất tán cây 2021–2025.
      Mỗi lô trong danh sách lấy các điểm lưới nằm trong ranh giới lô, hoặc điểm gần nhất nếu lô nhỏ hay chỉ có tọa độ điểm.`,
      `Over the 5 Central Highlands provinces (boundaries before the 2025 merger), a grid of points 500 m apart (218,401 points) takes the values of the 2020 maps and of tree-cover loss in 2021–2025.
      Each plot in a list uses the grid points inside its outline, or the nearest point if the plot is small or given as a point.`)}</p>
    <ul class="steps">
      <li>${tx("<b>Cao</b>: có mất tán cây sau 2020 (Hansen hoặc JRC TMF) ở nơi ít nhất một bản đồ gọi là rừng năm 2020. Các bản đồ gồm GFC2020 V4, JRC TMF, Hansen, ESA WorldCover, và bản đồ diễn biến rừng 2020 của Việt Nam.",
        "<b>High</b>: tree-cover loss after 2020 (Hansen or JRC TMF) where at least one map calls the land forest in 2020. The maps are GFC2020 V4, JRC TMF, Hansen, ESA WorldCover and Vietnam's 2020 forest-status map.")}</li>
      <li>${tx("<b>Trung bình</b>: không có mất tán, nhưng các bản đồ không thống nhất về rừng năm 2020, hoặc GFC2020 V1 khác V4. Lô cà phê ở nơi mọi bản đồ đều gọi là rừng cũng xếp mức này.",
        "<b>Medium</b>: no loss, but the maps disagree on forest in 2020, or GFC2020 V1 differs from V4. A coffee plot where every map says forest is also ranked here.")}</li>
      <li>${tx("<b>Thấp</b>: không bản đồ nào gọi là rừng năm 2020 và không có mất tán.", "<b>Low</b>: no map calls it forest in 2020 and there is no loss.")}</li></ul>
    <p>${tx("Lô mức Cao vào hàng đợi xem ảnh. Lô mức Trung bình và Thấp được kiểm tra ngẫu nhiên một tỷ lệ nhỏ để chắc chắn sàng lọc không bỏ sót. Mẫu chọn theo mã lô, nên lần sau cho đúng các lô như lần trước.",
      "High plots go to the image-check queue. A small random share of Medium and Low plots is checked too, to make sure the screening does not miss cases. The sample follows the plot codes, so the same plots are picked every time.")}</p>
    <h2>${tx("Mức ưu tiên đúng đến đâu", "How reliable the priority is")}</h2>
    <p>${tx(`So với ${fmt(S.meta.n_ref)} lô nghiên cứu có nhãn tham chiếu. Mỗi nhãn trả lời hai câu hỏi về sự thật, và một hàm luật theo Điều 2 Quy định (EU) 2023/1115 cho kết luận.
      Mẫu được chọn có chủ đích (nhiều vùng cảnh báo), nên không đại diện cho diện tích.`,
      `Compared with the ${fmt(S.meta.n_ref)} study plots that have a reference label. Each label answers two factual questions, and a rule following Article 2 of Regulation (EU) 2023/1115 gives the verdict.
      The sample was drawn on purpose (many alert patches), so it does not represent area.`)}</p>
    ${tierTable()}
    <p>${tx(`${nc3} trên ${nc} lô không tuân thủ nằm ở mức Cao, nên sàng lọc ít bỏ sót. Nhưng phần lớn lô mức Cao vẫn tuân thủ hoặc chưa xác định,
      nên <b>mức Cao nghĩa là "cần xem", không phải "vi phạm"</b>.`,
      `${nc3} of the ${nc} non-compliant plots are ranked High, so the screening rarely misses. But most High plots are still compliant or undetermined,
      so <b>High means "to be checked", not "in breach"</b>.`)}</p>
    <h2>${tx("Vì sao không dùng một bản đồ duy nhất", "Why not rely on a single map")}</h2>
    <p>${tx(`Các bản đồ sai theo những hướng ngược nhau. GFC2020 V1 gọi phần lớn cà phê là rừng. V4 bỏ sót nhiều rừng khộp thưa và rừng tự nhiên nghèo.
      Bản đồ hiện trạng quốc gia đánh dấu rừng trồng (kể cả cao su) mà các bản đồ quốc tế hay bỏ qua. Vì vậy trang cho thấy chỗ các bản đồ bất đồng, thay vì chọn một bản đồ làm đáp án.`,
      `The maps err in opposite directions. GFC2020 V1 calls most coffee forest. V4 misses much open dry dipterocarp forest and poor natural forest.
      The national forest-status map marks plantations (rubber included) that the global maps often leave out. So the site shows where the maps disagree instead of picking one map as the answer.`)}</p>
    <h2>${tx("Mô hình chuỗi thời gian", "The time-series model")}</h2>
    <p>${tx(`Với 1780 lô nghiên cứu, trang hiển thị xác suất mất rừng từ mô hình LightGBM trên chuỗi NDVI Sentinel-2, Landsat và Sentinel-1 (dự đoán chéo, độ chính xác cân bằng khoảng 0,74).
      Mô hình bỏ sót gần một nửa số ca mất rừng, nên chỉ dùng để xếp thứ tự, không dùng để kết luận.`,
      `For the 1780 study plots the site shows the probability of deforestation from a LightGBM model on Sentinel-2, Landsat and Sentinel-1 time series (cross-validated, balanced accuracy about 0.74).
      The model misses almost half of the deforestation cases, so it is used only to rank plots, never to decide.`)}</p>
    <h2>${tx("Giới hạn của bản thử", "Limits of this beta")}</h2>
    <ul class="steps"><li>${tx("Lưới 500 m là điểm mẫu. Tính trên đúng ranh giới lô và tạo ảnh bằng chứng cho lô mới cần máy chủ xử lý ảnh (giai đoạn 2).",
        "The 500 m grid is a sample of points. Measuring on the exact plot outline and making evidence sheets for new plots needs an imagery server (phase 2).")}</li>
      <li>${tx("Chỉ áp dụng cho 5 tỉnh Tây Nguyên. Lô nhỏ và cà phê có cây che bóng khó phân biệt với rừng trên ảnh 10 m.",
        "It covers the 5 Central Highlands provinces only. Small plots and shaded coffee are hard to tell from forest on 10 m imagery.")}</li>
      <li>${tx("Kết quả kiểm tra chỉ lưu trong trình duyệt đang dùng.", "Check results are kept only in the browser in use.")}</li>
      <li>${tx("Không phải hệ thống chính thức và không thay cho hồ sơ thẩm định (due diligence) theo EUDR.", "It is not an official system and does not replace EUDR due diligence.")}</li></ul>
  </div>`;
}
function renderData() {
  const rows = [
    [tx("Bản đồ diễn biến rừng năm 2020 (lô rừng: tiểu khu, khoảnh, lô, loại đất loại rừng, chủ rừng, quy hoạch)", "2020 forest-status map (forest lots: sub-compartment, compartment, lot, land and forest type, owner, planning class)"),
      tx("Cục Kiểm lâm", "Vietnam Forest Protection Department (Cục Kiểm lâm)") + " · <a href='https://tnr.vnforest.gov.vn' target='_blank' rel='noopener'>tnr.vnforest.gov.vn</a>",
      tx("Lớp lô rừng trên bản đồ, thông tin lô tại vị trí lô, một bản đồ trong mức ưu tiên", "The forest-lot layer, the lot at each plot, one of the maps in the priority"),
      tx("Dữ liệu công khai qua dịch vụ WFS của trang. Cần xác nhận điều khoản sử dụng trước khi phát hành rộng", "Public data from the site's WFS service. Terms of use to be confirmed before wide release")],
    [tx("GFC2020 phiên bản 1–4", "GFC2020 versions 1–4"), "JRC, EU Forest Observatory", tx("Mức ưu tiên, so sánh phiên bản", "Priority, version comparison"), "CC BY 4.0"],
    ["Tropical Moist Forests", "JRC", tx("Rừng 2020, mất và suy thoái sau 2020", "Forest in 2020, loss and degradation after 2020"), "CC BY 4.0"],
    ["Global Forest Change v1.13", "Hansen / UMD", tx("Độ che phủ, mất tán theo năm", "Tree cover, yearly loss"), "CC BY 4.0"],
    ["WorldCover 2020", "ESA", tx("Cây gỗ năm 2020", "Tree cover in 2020"), "CC BY 4.0"],
    ["Integrated deforestation alerts", "Global Forest Watch", tx("Vùng cảnh báo của lô nghiên cứu", "Alert patches of the study plots"), "CC BY 4.0"],
    ["Sentinel-1, Sentinel-2", "Copernicus", tx("Tấm bằng chứng, chuỗi NDVI", "Evidence sheets, NDVI series"), tx("Giấy phép Copernicus (miễn phí, ghi nguồn)", "Copernicus licence (free, with attribution)")],
    [tx("World Imagery và Wayback", "World Imagery and Wayback"), "Esri", tx("Ảnh nền vệ tinh mới nhất và theo năm", "Latest and yearly satellite base maps"), tx("Theo điều khoản Esri; cần kiểm tra khi dùng thương mại", "Esri terms; to be checked for commercial use")],
    [tx("Ranh giới xã sau sáp nhập 07/2025", "Commune boundaries after the 07/2025 merger"), tx("sapnhap.bando.com.vn, qua vietnamese-provinces-database", "sapnhap.bando.com.vn, via vietnamese-provinces-database"),
      tx("Gán xã cho lô, kế hoạch thực địa", "Commune of each plot, field plans"), tx("MIT (bộ sưu tập)", "MIT (the collection)")],
    [tx("Nền bản đồ", "Base map"), "OpenFreeMap, OpenStreetMap", tx("Bản đồ nền", "Base map"), "ODbL"],
    [tx("Bộ dữ liệu EUDR-CH (1780 lô, nhãn tham chiếu)", "EUDR-CH dataset (1780 plots, reference labels)"),
      tx("Nghiên cứu này", "This study") + " · <a href='https://www.kaggle.com/datasets/somebodyknow/eudr-ch' target='_blank' rel='noopener'>Kaggle</a> · <a href='https://github.com/datrich/vEUDR' target='_blank' rel='noopener'>GitHub</a>",
      tx("Lô nghiên cứu, ảnh bằng chứng, kiểm chứng mức ưu tiên", "Study plots, evidence sheets, checking the priority"), "CC BY 4.0"],
  ];
  $("#page-data").innerHTML = `<div class="doc wide">
    <h1>${tx("Dữ liệu và nguồn", "Data and sources")}</h1>
    <div class="scroll"><table class="rep"><tr><th>${tx("Dữ liệu", "Data")}</th><th>${tx("Nguồn", "Source")}</th><th>${tx("Dùng để", "Used for")}</th><th>${tx("Giấy phép", "Licence")}</th></tr>
      ${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</table></div>
    <h2>${tx("Về bản đồ diễn biến rừng 2020", "About the 2020 forest-status map")}</h2>
    <p>${tx(`Gồm ${fmt(892942)} lô ở 5 tỉnh Đắk Lắk, Đắk Nông, Gia Lai, Kon Tum, Lâm Đồng (địa giới trước 07/2025), tải từ dịch vụ bản đồ công khai của tnr.vnforest.gov.vn.
      Ranh giới được đơn giản hóa khoảng 1–2 m để hiển thị. Đây là bản đồ mà hệ thống phân vùng xanh, vàng, đỏ chính thức dựa vào, nên doanh nghiệp cần biết lô của mình nằm trên lô rừng nào.
      Bản đồ có thể đã được các địa phương cập nhật sau năm 2020; khi có khác biệt, số liệu của cơ quan quản lý là căn cứ.`,
      `It holds ${fmt(892942)} lots in the 5 provinces of Đắk Lắk, Đắk Nông, Gia Lai, Kon Tum and Lâm Đồng (units before 07/2025), downloaded from the public map service of tnr.vnforest.gov.vn.
      Outlines are simplified by about 1–2 m for display. The official green, yellow and red zoning relies on this map, so businesses need to know which forest lot their plots fall on.
      Local authorities may have updated the map since 2020; where they differ, the authorities' records prevail.`)}</p>
    <h2>${tx("Dữ liệu của bạn", "Your data")}</h2>
    <p>${tx(`Danh sách lô tải lên chỉ được xử lý trong trình duyệt, không gửi lên máy chủ nào. Kết quả kiểm tra lưu trong bộ nhớ của trình duyệt đang dùng.
      Tọa độ lô của nông hộ là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP; khi chuyển sang hệ thống có máy chủ cần có sự đồng ý của chủ lô.`,
      `An uploaded plot list is processed only in your browser and sent to no server. Check results are kept in the storage of the browser in use.
      Farmers' plot coordinates are personal data under Decree 13/2023/ND-CP; moving to a server-based system will need the plot owners' consent.`)}</p>
  </div>`;
}

// ------------------------------------------------------------------ router
const ROUTES = { "": "home", "ban-do": "map", "danh-sach": "plots", "thuc-dia": "field", "bao-cao": "report", "phuong-phap": "method", "du-lieu": "data" };
const PATHS = Object.fromEntries(Object.entries(ROUTES).map(([k, v]) => [v, k]));
function go(route) { if (S.route !== route) { location.hash = "#/" + PATHS[route]; applyRoute(); } }
function applyRoute() {
  const [path, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const route = ROUTES[path] ?? "home";
  S.route = route;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.route === route));
  document.title = `${TITLES[route]} · vEUDR`;
  const docPage = { home: "#page-home", report: "#page-report", method: "#page-method", data: "#page-data" }[route];
  document.querySelectorAll(".page").forEach((p) => (p.hidden = "#" + p.id !== docPage));
  document.body.classList.toggle("on-doc", !!docPage);
  for (const [r, id] of [["map", "#panel-map"], ["plots", "#panel-plots"], ["field", "#panel-field"]]) $(id).classList.toggle("on", r === route);
  if (!S.ready) return;
  if (route === "home") renderHome();
  if (route === "report") renderReport();
  if (docPage) { $(docPage).scrollTop = 0; return; }
  if (route === "plots" && arg && plotById(decodeURIComponent(arg))) flyPlot(decodeURIComponent(arg));
}
window.addEventListener("hashchange", applyRoute);

// ------------------------------------------------------------------ switching language
// static text in index.html: the Vietnamese version is kept on first use, the English one is in data-en
function applyStaticLang() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-en]").forEach((el) => {
    if (el.dataset.vi == null) el.dataset.vi = el.innerHTML;
    el.innerHTML = LANG === "en" ? el.dataset.en : el.dataset.vi;
  });
  document.querySelectorAll("[data-en-ph]").forEach((el) => {
    if (el.dataset.viPh == null) el.dataset.viPh = el.placeholder;
    el.placeholder = LANG === "en" ? el.dataset.enPh : el.dataset.viPh;
  });
  document.querySelectorAll("[data-en-aria]").forEach((el) => {
    if (el.dataset.viAria == null) el.dataset.viAria = el.getAttribute("aria-label");
    el.setAttribute("aria-label", LANG === "en" ? el.dataset.enAria : el.dataset.viAria);
  });
  document.querySelectorAll(".lang [data-lang]").forEach((b) => { b.classList.toggle("on", b.dataset.lang === LANG); b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)); });
}
function setLang(l) {
  if (l !== "vi" && l !== "en") return;
  LANG = l; store.set("veudr:lang", l);
  const u = new URL(location.href); u.searchParams.set("lang", l); history.replaceState(null, "", u);
  defineTexts(); applyStaticLang(); renderWbOptions(); renderBaseControl();
  document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
  if (!S.ready) return;
  renderLegend(); renderLotsLegend(); renderStats(); renderMethod(); renderData(); renderResume();
  if (map.getLayer("lots-label")) map.setLayoutProperty("lots-label", "text-field", lotLabel());
  if (S.list) { renderList(); renderField(); } else renderField();
  applyRoute();
  const o = S.open;  // reopen the drawer in the new language
  if (o?.kind === "plot") openPlot(o.id); else if (o?.kind === "item") openItem(o.id); else if (o?.kind === "lot") openLot(o.q, o.lngLat);
}
document.querySelectorAll(".lang [data-lang]").forEach((b) => (b.onclick = () => setLang(b.dataset.lang)));

// ------------------------------------------------------------------ wiring and start
document.querySelectorAll("input[name=mode]").forEach((r) => (r.onchange = () => { S.mode = r.value; renderGrid(); }));
$("#opacity").oninput = () => map.getLayer("grid") && map.setPaintProperty("grid", "raster-opacity", gridOpacity());
$("#t-grid").onchange = (e) => map.setLayoutProperty("grid", "visibility", e.target.checked ? "visible" : "none");
$("#t-communes").onchange = (e) => map.setLayoutProperty("communes", "visibility", e.target.checked ? "visible" : "none");
$("#t-items").onchange = (e) => setItemsVisible(e.target.checked);
$("#prov").onchange = renderStats;
applyStaticLang();
setBase("map");

async function loadGrid(url) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const c = Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}
applyRoute();
setTimeout(() => {  // the base map style or the data did not arrive: say so instead of a silent blank map
  if (!S.ready) document.body.insertAdjacentHTML("afterbegin", `<div class="fatal">${tx("Bản đồ đang tải chậm. Nếu trang vẫn trống, hãy tải lại trang (F5).", "The map is loading slowly. If the page stays blank, reload it (F5).")}</div>`);
}, 20000);
Promise.all([fetch("data/meta.json").then((r) => r.json()), loadGrid("data/grid.png"), fetch("data/items.geojson").then((r) => r.json()),
  fetch("data/communes.geojson").then((r) => r.json()), styleReady]).then(([meta, grid, items, communes]) => {
  S.meta = meta; S.grid = grid;
  const c = meta.grid.coordinates;
  map.fitBounds([c[3], c[1]], { padding: 20, duration: 0 });
  renderGrid(); addLots(); prepCommunes(communes); addItems(items);
  renderStats(); renderMethod(); renderData(); renderField(); renderResume();
  S.ready = true;
  applyRoute();
}).catch((e) => { console.error(e); document.body.insertAdjacentHTML("afterbegin", `<div class="fatal">${tx("Không tải được dữ liệu", "Could not load the data")}: ${esc(e.message)}</div>`); });
