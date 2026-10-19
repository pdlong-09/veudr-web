"""Build the static data of the vEUDR screening map (webapp/public/data, webapp/public/sheets).

    .venv/Scripts/python webapp/build_data.py            # grid + items + model scores
    .venv/Scripts/python webapp/build_data.py --sheets   # also the evidence sheets (JPEG, ~1780 files)

Only open-licence layers go to the web (as in the Kaggle release): GFC2020 V1-V4, JRC TMF, Hansen GFC, ESA WorldCover,
GFW integrated alerts, Dynamic World, Copernicus Sentinel. The national 2020 forest-status lots, the FDP coffee map
and Nature Trace stay out until their licences are checked.

grid.png (Web Mercator, ~512 m pixels, nearest 500 m grid point, RGB, alpha 255):
    R bits 0-3 GFC2020 V1..V4 forest, bit 4 TMF forest 2020, bit 5 Hansen forest 2020 (tc2000 >= 30, no loss
      before 2021), bit 6 WorldCover 2020 tree cover, bit 7 = valid pixel
    G bits 0-4 Hansen loss year (0 = none, 21..25), bit 7 = loss after 2020 (Hansen 2021-25 or TMF loss)
    B bits 0-2 province code (1 Dak Lak, 2 Dak Nong, 3 Gia Lai, 4 Kon Tum, 5 Lam Dong), bits 3-4 official 2020 forest-status
      lot at the point (0 outside the lots, 1 natural forest, 2 plantation forest, 3 not forest), from the public WFS of
      tnr.vnforest.gov.vn
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from PIL import Image
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
KAG = ROOT / "release" / "kaggle" / "eudr-ch"
GRID = ROOT / "data" / "processed" / "vnforest"
FEAT = ROOT / "runs" / "dossier" / "hybrid_ts_vlm_report_all1000.features.csv"
OUT = Path(__file__).resolve().parent / "public"
PROV = {"daklak": 1, "daknong": 2, "gialai": 3, "kontum": 4, "lamdong": 5}
R = 6378137.0
PX = 512.0  # Web Mercator metres per pixel (~500 m on the ground at 13 N)


def merc(lon, lat):
    return np.radians(lon) * R, np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) * R


def unmerc(x, y):
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


def tier(n_forest: np.ndarray, loss: np.ndarray, v1v4: np.ndarray, off: np.ndarray) -> np.ndarray:
    """Screening tier (same rule in app.js). n_forest = how many of the 4 open maps (GFC2020 V4, TMF, Hansen,
    WorldCover) say forest in 2020; off = the official 2020 forest-status map says forest (natural or plantation).
    3 high = loss after 2020 where any of these says forest; 0 = all five agree on forest, no loss;
    1 low = none says forest, no loss; 2 medium = everything else (they disagree, or GFC2020 V1 and V4 differ)."""
    anyf = (n_forest >= 1) | off
    return np.select([loss & anyf, (n_forest == 4) & off & ~v1v4, ~anyf & ~v1v4], [3, 0, 1], 2)


def build_grid() -> dict:
    g = gpd.read_parquet(GRID / "grid500_tn.parquet").join(pd.read_parquet(GRID / "grid500_tn_extra.parquet"))
    g = g[g.gfc.notna()]
    x, y = merc(g.geometry.x.values, g.geometry.y.values)
    x0, y1 = math.floor(x.min() / PX) * PX - PX, math.ceil(y.max() / PX) * PX + PX
    w, h = int((x.max() - x0) / PX) + 2, int((y1 - y.min()) / PX) + 2
    cx = x0 + (np.arange(w) + 0.5) * PX
    cy = y1 - (np.arange(h) + 0.5) * PX
    gx, gy = np.meshgrid(cx, cy)
    # ground distance = mercator distance * cos(lat); keep pixels within 400 m of a grid point
    d, idx = cKDTree(np.c_[x, y]).query(np.c_[gx.ravel(), gy.ravel()], distance_upper_bound=PX * 0.9)
    ok = np.isfinite(d)
    idx = np.where(ok, idx, 0)

    def col(c):
        return g[c].fillna(0).values.astype(int)[idx]
    r = sum(col(c) << b for b, c in enumerate(["gfcV1", "gfcV2", "gfcV3", "gfcV4", "tmf", "han", "wc"])) | (1 << 7)
    ly = col("lossyear")
    gch = np.where(ly >= 21, ly, 0) | (col("loss") << 7)
    offc = g.off_cls.map({"natural": 1, "plantation": 2, "nonforest": 3}).fillna(0).values.astype(int)
    bch = (g.prov.map(PROV).fillna(0).values.astype(int) | (offc << 3))[idx]
    img = np.zeros((h * w, 3), np.uint8)
    img[ok, 0], img[ok, 1], img[ok, 2] = r[ok], gch[ok], bch[ok]
    (OUT / "data").mkdir(parents=True, exist_ok=True)
    Image.fromarray(img.reshape(h, w, 3), "RGB").save(OUT / "data" / "grid.png", optimize=True)
    west, north = unmerc(x0, y1)
    east, south = unmerc(x0 + w * PX, y1 - h * PX)

    # statistics on the grid points themselves (each point = 25 ha)
    nf = (g.gfcV4 + g.tmf + g.han + g.wc).values
    off = np.isin(offc, [1, 2])
    t = tier(nf, g.loss.values == 1, (g.gfcV1 != g.gfcV4).values, off)
    st = {}
    for name, m in [("all", np.ones(len(g), bool))] + [(p, (g.prov == p).values) for p in PROV]:
        st[name] = {"points": int(m.sum()), "tier": {int(k): int((t[m] == k).sum()) for k in range(4)},
                    "agree": {int(k): int((nf[m] == k).sum()) for k in range(5)},
                    "v1": int(g.gfcV1.values[m].sum()), "v4": int(g.gfcV4.values[m].sum()),
                    "loss": int((g.loss.values[m] == 1).sum()), "off_forest": int(off[m].sum())}
    return {"width": w, "height": h, "px_m": PX, "x0": x0, "y1": y1,
            "coordinates": [[west, north], [east, north], [east, south], [west, south]], "stats": st}


def model_scores() -> pd.Series:
    """Out-of-fold probability of deforestation from the time-series LightGBM (features of the paper's model E1),
    trained on the 1000-item reference (person and model labels), spatial blocks as groups, mean of 5 seeds."""
    import lightgbm as lgb
    from sklearn.model_selection import GroupKFold
    F = pd.read_csv(FEAT, index_col="item_id")
    ts = list(F.columns[:F.columns.get_loc("alert_year") + 1])
    ref = pd.read_csv(KAG / "labels" / "reference_labels_all1000.csv").set_index("item_id")
    blk = pd.read_csv(KAG / "items.csv").set_index("item_id").block_0p2deg
    d = ref[ref.deforestation.notna()].index.intersection(F.index)
    X, y, grp = F.loc[d, ts], ref.loc[d, "deforestation"].astype(int).values, blk.loc[d].values
    oof = np.zeros(len(d))
    for seed in range(5):
        ug = np.unique(grp)
        perm = dict(zip(ug, np.random.default_rng(seed).permutation(len(ug))))
        g2 = np.array([perm[v] for v in grp])
        for tr, te in GroupKFold(n_splits=5).split(X, y, g2):
            m = lgb.LGBMClassifier(num_leaves=7, n_estimators=200, learning_rate=0.05, min_child_samples=5,
                                   class_weight="balanced", random_state=seed, verbose=-1).fit(X.iloc[tr], y[tr])
            oof[te] += m.predict_proba(X.iloc[te])[:, 1] / 5
    pred = (oof >= 0.5).astype(int)
    tpr, tnr = pred[y == 1].mean(), 1 - pred[y == 0].mean()
    print(f"model OOF on {len(y)} items: balanced accuracy {(tpr + tnr) / 2:.3f} (sens {tpr:.3f}, spec {tnr:.3f})")
    return pd.Series(oof, index=d)


def build_items() -> dict:
    it = pd.read_csv(KAG / "items.csv").set_index("item_id")
    mf = pd.read_parquet(KAG / "map_features.parquet").set_index("item_id")
    ref = pd.read_csv(KAG / "labels" / "reference_labels_all1000.csv").set_index("item_id")
    per = pd.read_csv(KAG / "labels" / "reference_labels.csv").set_index("item_id")
    lab = pd.read_csv(KAG / "labels" / "labels.csv")
    lu = lab.groupby("item_id").land_use_2020.agg(lambda s: s.mode().iat[0] if len(s.mode()) else None)
    ms = model_scores()
    ol = gpd.read_file(KAG / "outlines.geojson").set_index("item_id")
    # map-overlay facts per item, thresholds as the paper's baselines (share >= 0.5 of the item)
    f = pd.DataFrame(index=mf.index)
    f["gfcV1"] = mf.gfcV1 >= 0.5
    f["gfcV4"] = mf.gfcV4 >= 0.5
    f["tmf"] = (mf.tmf20_undisturbed.fillna(0) + mf.tmf20_degraded.fillna(0)) >= 0.5
    f["han"] = (mf.tc2000 >= 30) & (mf.hl_pre2021.fillna(0) < 0.5)
    f["wc"] = mf.wc20_tree >= 0.5
    f["loss"] = (mf.hl_post2020.fillna(0) >= 0.1) | (mf.gfw_post2020.fillna(0) >= 0.1)
    lf = pd.read_parquet(ROOT / "data" / "processed" / "dossier" / "s1" / "legal_features.parquet").set_index("item_id")
    oc = lf.reindex(mf.index)[["off_natural", "off_plantation", "off_nonforest", "off_outside"]].fillna(0)
    f["off"] = (oc.off_natural + oc.off_plantation) >= 0.5
    nf = f[["gfcV4", "tmf", "han", "wc"]].sum(axis=1).values
    f["tier"] = tier(nf, f.loss.values, (f.gfcV1 != f.gfcV4).values, f.off.values)

    def r(v, n=3):
        return None if pd.isna(v) else round(float(v), n)
    feats = []
    for iid, row in it.iterrows():
        m, ff = mf.loc[iid], f.loc[iid]
        p = {"id": iid, "kind": row.kind, "stratum": row.stratum, "area": r(row.area_ha, 2), "prov": row.province_2020,
             "alert": None if pd.isna(row.first_alert_date) else row.first_alert_date, "split": row.split,
             "tier": int(ff.tier), "maps": {k: bool(ff[k]) for k in ["gfcV1", "gfcV4", "tmf", "han", "wc", "off", "loss"]},
             "off": {k.replace("off_", ""): r(oc.loc[iid, k]) for k in oc.columns},
             "mf": {k: r(m[k]) for k in ["gfcV1", "gfcV2", "gfcV3", "gfcV4", "tmf_natural", "tmf_plantation", "tc2000",
                                         "hl_pre2021", "hl_post2020", "gfw_post2020", "wc20_tree", "h_meta_mean",
                                         "dw_trees_2019", "dw_crops_2025"]},
             "ndvi": [r(m[f"ndvi_dry_{y}"]) for y in range(2019, 2027)],
             "lon": r(row.lon, 6), "lat": r(row.lat, 6)}
        if iid in ref.index:
            q = ref.loc[iid]
            p["ref"] = {"verdict": q.verdict, "forest_2020": int(q.forest_2020), "change": None if pd.isna(q.change_class) else q.change_class,
                        "conf": q.confidence, "source": q.label_sources, "status": q.status, "land_use": lu.get(iid)}
            if iid in per.index:
                p["ref"]["person_verdict"] = per.loc[iid, "verdict"]
        if iid in ms.index:
            p["model"] = r(ms[iid])
        geom = ol.loc[iid, "geometry"]
        feats.append({"type": "Feature", "properties": p,
                      "geometry": json.loads(gpd.GeoSeries([geom]).set_precision(1e-6).to_json())["features"][0]["geometry"]})
    (OUT / "data" / "items.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                                                           ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # how the tiers turn out against the reference labels (stratified sample, not area-representative)
    lab_t = f.join(ref[["verdict"]], how="inner")
    return {"tier_vs_ref": {int(k): lab_t[lab_t.tier == k].verdict.value_counts().to_dict() for k in range(4)},
            "n_items": len(feats), "n_ref": int(len(ref)), "n_person": int(len(per)), "n_model": int(len(ms))}


def polygons_only(geom):
    """set_precision can leave slivers as lines: keep the polygonal part (GeometryCollection -> MultiPolygon)."""
    from shapely.geometry import MultiPolygon
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    parts = [g for g in getattr(geom, "geoms", []) for g in (g.geoms if g.geom_type == "MultiPolygon" else [g]) if g.geom_type == "Polygon"]
    return MultiPolygon(parts)


def build_communes() -> int:
    """Post-07/2025 communes over the 5 provinces (sapnhap.bando.com.vn via thanglequoc/vietnamese-provinces-database,
    MIT), simplified, for grouping uploaded plots by commune and for field plans."""
    old = gpd.read_file(ROOT / "gazetteer" / "old_units.gpkg", layer="province")
    area = old[old.province_key.isin(["dak lak", "dak nong", "gia lai", "kon tum", "lam dong"])].union_all()
    c = gpd.read_file(ROOT / "gazetteer" / "new_units.gpkg", layer="commune").to_crs(4326)
    m = c.to_crs(32649)
    share = m.intersection(gpd.GeoSeries([area], crs=4326).to_crs(32649).iloc[0]).area / m.area
    c = c[share.values >= 0.2].copy()
    c["geometry"] = c.geometry.simplify(0.0004, preserve_topology=True).set_precision(1e-5).apply(polygons_only)
    c = c.rename(columns={"name": "xa", "province_name": "tinh"})[["xa", "tinh", "geometry"]]
    c["tinh"] = c.tinh.str.replace("Tỉnh ", "", regex=False)
    (OUT / "data" / "communes.geojson").write_text(c.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    return len(c)


def build_sample():
    """Demo list for the upload: the 580 coffee plots of the study (1 ha squares) as a business would send them
    (code, latitude, longitude, area), plus four rows with the data problems the check must catch."""
    it = pd.read_csv(KAG / "items.csv")
    p = it[it.kind == "plot"].reset_index(drop=True)
    rows = [{"ma_lo": f"LO-{i + 1:04d}", "vi_do": round(r.lat, 6), "kinh_do": round(r.lon, 6), "dien_tich_ha": 1.0}
            for i, r in p.iterrows()]
    a, b = rows[100], rows[200]
    rows += [{"ma_lo": "LO-0010", "vi_do": a["vi_do"] + 0.01, "kinh_do": a["kinh_do"], "dien_tich_ha": 1.2},     # duplicate code
             {"ma_lo": f"LO-{len(p) + 1:04d}", "vi_do": b["kinh_do"], "kinh_do": b["vi_do"], "dien_tich_ha": 0.8},  # swapped
             {"ma_lo": f"LO-{len(p) + 2:04d}", "vi_do": a["vi_do"], "kinh_do": None, "dien_tich_ha": 1.0},          # missing
             {"ma_lo": f"LO-{len(p) + 3:04d}", "vi_do": rows[300]["vi_do"] + 0.02, "kinh_do": rows[300]["kinh_do"],
              "dien_tich_ha": 6.5}]                                                                                 # > 4 ha as a point
    pd.DataFrame(rows).to_csv(OUT / "data" / "danh_sach_lo_mau.csv", index=False, encoding="utf-8-sig")
    return len(rows)


def build_sheets():
    dst = OUT / "sheets"
    dst.mkdir(parents=True, exist_ok=True)
    for i, p in enumerate(sorted((KAG / "sheets" / "standard").glob("*.png"))):
        q = dst / (p.stem + ".jpg")
        if not q.exists():
            Image.open(p).convert("RGB").save(q, "JPEG", quality=72, optimize=True, progressive=True)
        if i % 200 == 0:
            print("sheets", i, flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", action="store_true")
    a = ap.parse_args()
    meta = {"grid": build_grid()}
    meta.update(build_items())
    meta["n_communes"] = build_communes()
    meta["n_sample_rows"] = build_sample()
    (OUT / "data" / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in meta.items() if k != "grid"}, indent=1))
    print("grid", meta["grid"]["width"], "x", meta["grid"]["height"], meta["grid"]["stats"]["all"])
    if a.sheets:
        build_sheets()
