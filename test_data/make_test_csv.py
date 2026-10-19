"""    .venv/Scripts/python webapp/test_data/make_test_csv.py . webapp/test_data/danh_sach_lo_thu.csv

Build a test plot list (CSV, Vietnamese Excel style: ';' separator, decimal comma, UTF-8 BOM) exercising the web app."""
import sys
from pathlib import Path
import geopandas as gpd, numpy as np, pandas as pd

ROOT = Path(sys.argv[1]); OUT = Path(sys.argv[2])
sys.path.insert(0, str(ROOT / "webapp"))
from build_data import tier  # same rule as the app
g = gpd.read_parquet(ROOT / "data/processed/vnforest/grid500_tn.parquet").join(pd.read_parquet(ROOT / "data/processed/vnforest/grid500_tn_extra.parquet"))
g = g[g.gfc.notna()].copy()
off = g.off_cls.isin(["natural", "plantation"]).values
g["t"] = tier((g.gfcV4 + g.tmf + g.han + g.wc).values, g.loss.values == 1, (g.gfcV1 != g.gfcV4).values, off)
g["lon"], g["lat"] = g.geometry.x, g.geometry.y
rng = np.random.default_rng(7)
rows = []
def add(df, n, purpose, prefix):
    for _, r in df.sample(n, random_state=int(rng.integers(1e6))).iterrows():
        rows.append({"lat": r.lat, "lon": r.lon, "purpose": purpose, "prefix": prefix})

# a cluster of plots in one area (field plan by commune): 6 high-tier points within ~4 km of a centre in Dak Lak
hi = g[(g.t == 3) & (g.prov == "daklak")]
c = hi.sample(1, random_state=3).iloc[0]
near = g[(abs(g.lon - c.lon) < 0.03) & (abs(g.lat - c.lat) < 0.03)]
add(near[near.t == 3], min(4, (near.t == 3).sum()), "Mức Cao, cùng một cụm: thử kế hoạch thực địa theo xã", "CUM")
add(near[near.t == 2], 3, "Mức Trung bình, cùng cụm", "CUM")
add(g[(g.t == 3) & (g.off_cls == "natural")], 4, "Mức Cao, nằm trên lô rừng tự nhiên 2020 (tnr.vnforest.gov.vn)", "CAO")
add(g[(g.t == 3) & (g.off_cls == "outside_lots")], 3, "Mức Cao, ngoài lô lâm nghiệp: mất tán theo bản đồ quốc tế", "CAO")
add(g[(g.t == 2) & (g.off_cls == "plantation")], 3, "Mức Trung bình, nằm trên lô rừng trồng 2020", "TB")
add(g[(g.t == 2) & (g.off_cls == "outside_lots")], 5, "Mức Trung bình: các bản đồ bất đồng (thường do GFC2020 V1 khác V4)", "TB")
add(g[g.t == 0], 2, "Mọi bản đồ gọi là rừng: lô cà phê ở đây bất thường, xếp Trung bình", "RUNG")
add(g[(g.t == 1) & (g.off_cls == "outside_lots")], 10, "Mức Thấp: không bản đồ nào gọi là rừng, không mất tán", "THAP")
add(g[(g.t == 1) & (g.off_cls == "nonforest")], 2, "Mức Thấp, nằm trong lô lâm nghiệp nhưng chưa có rừng (đất nông nghiệp DNN)", "THAP")

# study items: the app shows their evidence sheet and reference label
it = pd.read_csv(ROOT / "release/kaggle/eudr-ch/items.csv")
lab = pd.read_csv(ROOT / "release/kaggle/eudr-ch/labels/reference_labels_all1000.csv").set_index("item_id")
it = it.join(lab[["verdict"]], on="item_id")
for v, txt in [("non_compliant", "trùng lô nghiên cứu có nhãn KHÔNG tuân thủ, mức lấy theo ranh giới thật của lô nghiên cứu"), ("undetermined", "trùng lô nghiên cứu có nhãn CHƯA xác định"),
               ("compliant", "trùng lô nghiên cứu có nhãn tuân thủ")]:
    for _, r in it[(it.verdict == v) & (it.kind == "alert")].sample(2, random_state=11).iterrows():
        rows.append({"lat": r.lat, "lon": r.lon, "purpose": f"Có sẵn ảnh bằng chứng: {txt} ({r.item_id})", "prefix": "NC"})

df = pd.DataFrame(rows)
df["ma_lo"] = [f"{p}-{i + 1:03d}" for i, p in enumerate(df.prefix)]
df["ho_dan"] = [f"Hộ thử {i + 1:03d}" for i in range(len(df))]
df["dien_tich_ha"] = np.round(rng.uniform(0.4, 3.5, len(df)), 2)
df["xa"] = ""
df = df[["ma_lo", "ho_dan", "xa", "lat", "lon", "dien_tich_ha", "purpose"]].rename(columns={"lat": "vi_do", "lon": "kinh_do", "purpose": "muc_dich_thu"})

a, b = df.iloc[0], df.iloc[12]
extra = [
    {"ma_lo": "LOI-001", "ho_dan": "Hộ thử lỗi 1", "xa": "", "vi_do": b.kinh_do + 0.003, "kinh_do": b.vi_do + 0.003, "dien_tich_ha": 1.2, "muc_dich_thu": "Lỗi: vĩ độ và kinh độ bị đảo (trang tự sửa)"},
    {"ma_lo": df.ma_lo.iloc[5], "ho_dan": "Hộ thử lỗi 2", "xa": "", "vi_do": a.vi_do + 0.004, "kinh_do": a.kinh_do + 0.004, "dien_tich_ha": 0.9, "muc_dich_thu": "Lỗi: trùng mã lô với một dòng khác"},
    {"ma_lo": "LOI-003", "ho_dan": "Hộ thử lỗi 3", "xa": "", "vi_do": a.vi_do, "kinh_do": a.kinh_do, "dien_tich_ha": 1.0, "muc_dich_thu": "Lỗi: trùng tọa độ với lô đầu tiên"},
    {"ma_lo": "LOI-004", "ho_dan": "Hộ thử lỗi 4", "xa": "", "vi_do": None, "kinh_do": 108.05, "dien_tich_ha": 1.0, "muc_dich_thu": "Lỗi: thiếu vĩ độ (dòng bị bỏ qua)"},
    {"ma_lo": "LOI-005", "ho_dan": "Hộ thử lỗi 5", "xa": "", "vi_do": df.vi_do.iloc[20] + 0.002, "kinh_do": df.kinh_do.iloc[20], "dien_tich_ha": 6.8, "muc_dich_thu": "Lỗi: lô trên 4 ha chỉ có tọa độ điểm (EUDR cần đa giác)"},
    {"ma_lo": "", "ho_dan": "Hộ thử lỗi 6", "xa": "", "vi_do": df.vi_do.iloc[25] + 0.003, "kinh_do": df.kinh_do.iloc[25] - 0.002, "dien_tich_ha": 0.7, "muc_dich_thu": "Lỗi: thiếu mã lô (trang đặt mã theo số dòng)"},
    {"ma_lo": "NGOAI-001", "ho_dan": "Hộ thử ngoài vùng", "xa": "Xã Chiềng Ban", "vi_do": 21.2105, "kinh_do": 103.9512, "dien_tich_ha": 1.5, "muc_dich_thu": "Ngoài vùng dữ liệu (Sơn La): chưa sàng lọc được"},
    {"ma_lo": "NGOAI-002", "ho_dan": "Hộ thử gõ nhầm", "xa": "", "vi_do": 2.75, "kinh_do": 108.05, "dien_tich_ha": 1.0, "muc_dich_thu": "Lỗi: tọa độ gõ nhầm, nằm ngoài Việt Nam (vĩ độ 2,75 thay vì 12,75)"},
    {"ma_lo": "XA-001", "ho_dan": "Hộ thử có tên xã", "xa": "Xã tự ghi trong tệp", "vi_do": df.vi_do.iloc[30] + 0.003, "kinh_do": df.kinh_do.iloc[30] + 0.003, "dien_tich_ha": 2.0, "muc_dich_thu": "Có cột xã điền sẵn: trang dùng tên xã này thay vì tự xác định"},
]
df = pd.concat([df, pd.DataFrame(extra)], ignore_index=True)
fmt = lambda x, d: "" if pd.isna(x) else f"{x:.{d}f}".replace(".", ",")
df["vi_do"] = df.vi_do.map(lambda x: fmt(x, 6)); df["kinh_do"] = df.kinh_do.map(lambda x: fmt(x, 6)); df["dien_tich_ha"] = df.dien_tich_ha.map(lambda x: fmt(x, 2))
OUT.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(OUT, sep=";", index=False, encoding="utf-8-sig")
print(len(df), "rows ->", OUT)
print(df.muc_dich_thu.str.split(":").str[0].value_counts().to_string())
