"""Vector tiles of the official 2020 forest-status lots (diễn biến rừng 2020, public WFS of tnr.vnforest.gov.vn) for
the 5 Central Highlands provinces -> webapp/public/data/lots/{z}/{x}/{y}.pbf (layer "lots", zoom 11-13, overzoomed above).
A directory of small uncompressed tiles, not one PMTiles file: GitHub (100 MB) and Cloudflare Pages (25 MiB) cap the size
of a single file, and plain tiles need no HTTP Range support.

    PYTHONUTF8=1 .venv/Scripts/python webapp/build_lots.py     (UTF-8 mode: Vietnamese names on Windows)

Reads data/processed/vnforest/dbr2020_tn.parquet (built by src.dossier.official_map build) in batches, keeps the
attributes shown on the map, simplifies the outlines by ~1 m (below the z14 tile resolution of ~0.6 m per unit is not
needed for display) and writes PMTiles with GDAL. Takes a while: ~0.9 million polygons.
"""
from __future__ import annotations

import shutil
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pyogrio
import shapely

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "processed" / "vnforest" / "dbr2020_tn.parquet"
OUT = Path(__file__).resolve().parent / "public" / "data" / "lots"
COLS = ["tinh", "huyen", "xa", "tk", "khoanh", "lo", "dtich", "ldlr", "malr3", "mdsd", "churung", "sldlr", "namtr", "cls", "geometry"]


def clean(s: pd.Series) -> pd.Series:
    return s.astype("string").str.strip().replace({"": pd.NA, "nan": pd.NA, "None": pd.NA})


def main():
    t0 = time.time()
    f = pq.ParquetFile(SRC)
    parts = []
    for i, b in enumerate(f.iter_batches(batch_size=60000, columns=COLS)):
        d = b.to_pandas()
        geom = shapely.simplify(shapely.from_wkb(d.pop("geometry").values), 0.00001, preserve_topology=True)
        ok = ~shapely.is_empty(geom) & ~pd.isna(geom)
        out = pd.DataFrame({
            "tinh": clean(d.tinh), "huyen": clean(d.huyen), "xa": clean(d.xa),
            "tk": clean(d.tk), "kh": clean(d.khoanh), "lo": clean(d.lo),
            "dt": d.dtich.round(2),
            "ldlr": clean(d.ldlr),
            "cls": d.cls.map({"natural": "n", "plantation": "p", "nonforest": "x"}).fillna("x"),
            "qh": d.malr3.fillna(-1).astype(int),
            "mdsd": clean(d.mdsd), "cr": clean(d.churung), "loai": clean(d.sldlr),
            "namtr": d.namtr.fillna(0).astype(int),
        })
        parts.append(gpd.GeoDataFrame(out[ok], geometry=geom[ok], crs=4326))
        print(f"batch {i}: {sum(len(p) for p in parts)} lots, {time.time() - t0:.0f} s", flush=True)
    g = pd.concat(parts, ignore_index=True)
    del parts
    if OUT.exists():
        shutil.rmtree(OUT)
    print("writing", OUT, flush=True)
    pyogrio.write_dataframe(g, OUT, layer="lots", driver="MVT", encoding="UTF-8",
                            dataset_options={"MINZOOM": 11, "MAXZOOM": 13, "NAME": "Diễn biến rừng 2020 (tnr.vnforest.gov.vn)",
                                             "DESCRIPTION": "Lô rừng 2020, 5 tỉnh Tây Nguyên", "MAX_SIZE": 1500000,
                                             "MAX_FEATURES": 400000, "SIMPLIFICATION": 1.0, "COMPRESS": "NO", "TILE_EXTENSION": "pbf"})
    files = [f for f in OUT.rglob("*.pbf")]
    print(f"done: {len(g)} lots, {len(files)} tiles, {sum(f.stat().st_size for f in files) / 1e6:.0f} MB, "
          f"largest {max(f.stat().st_size for f in files) / 1e6:.1f} MB, {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
