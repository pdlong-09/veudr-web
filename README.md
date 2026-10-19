# vEUDR (bản thử): biết lô nào cần kiểm tra, bỏ qua lô không cần

Công cụ giúp doanh nghiệp cà phê sàng lọc danh sách lô của nông hộ theo EUDR. Trang không cấp chứng nhận tuân thủ. Nó chỉ ra **lô nào cần kiểm tra**, chuẩn bị bằng chứng vệ tinh và lưu kết quả kiểm tra của từng lô.

## Các trang

Trang web có nhiều trang, mỗi trang có địa chỉ riêng (dùng được nút quay lại của trình duyệt):

| Trang | Địa chỉ | Nội dung |
|---|---|---|
| Trang chủ | `#/` | Giới thiệu cho doanh nghiệp: vấn đề, 4 bước, con số từ nghiên cứu, giới hạn |
| Bản đồ | `#/ban-do` | Ảnh nền (bản đồ, vệ tinh mới nhất, vệ tinh theo năm Esri Wayback 2016–2026), lô rừng 2020 của tnr.vnforest.gov.vn, lớp sàng lọc 500 m, ranh giới xã, lô nghiên cứu |
| Danh sách lô | `#/danh-sach` | Tải lên, phễu kiểm tra, bảng lô, hồ sơ từng lô |
| Thực địa | `#/thuc-dia` | Kế hoạch đi thực địa theo xã, GPX |
| Báo cáo | `#/bao-cao` | Tổng hợp theo mức và theo xã, tiến độ, lỗi dữ liệu, xuất CSV / GPX / hồ sơ in |
| Phương pháp | `#/phuong-phap` | Cách xếp mức, kiểm chứng với 1000 lô có nhãn, giới hạn |
| Dữ liệu | `#/du-lieu` | Nguồn và giấy phép từng lớp dữ liệu |

## Quy trình trên trang

1. **Tải lên danh sách lô.** CSV (`ma_lo`, `vi_do`, `kinh_do`, có thể thêm `ho_dan`, `xa`, `dien_tich_ha`; dấu phân cách `,` hoặc `;`, chấp nhận dấu phẩy thập phân) hoặc GeoJSON (điểm hoặc đa giác, kể cả tên thuộc tính của tệp nộp EUDR: `ProductionPlace`, `ProducerName`, `Area`).
   - Trang tự kiểm tra dữ liệu: thiếu tọa độ, vĩ độ và kinh độ bị đảo, trùng mã lô, trùng tọa độ, lô trên 4 ha mà chỉ có điểm, tọa độ ngoài Việt Nam.
   - Mỗi lô được tự gán xã theo ranh giới xã sau sáp nhập.
2. **Nhận mức ưu tiên** Cao, Trung bình hoặc Thấp cho từng lô (bảng bên dưới). Hàng đợi "Chờ xem ảnh" gồm toàn bộ lô mức Cao, cộng một **mẫu ngẫu nhiên** 5%, 10% hoặc 20% của lô mức Trung bình và Thấp. Mẫu này chọn theo mã băm của mã lô, nên lần chọn sau cho đúng các lô như lần trước.
3. **Xem ảnh tại văn phòng.**
   - Nếu lô trùng vị trí một trong 1780 lô nghiên cứu, trang hiện luôn tấm bằng chứng Sentinel-2 và nhãn tham chiếu của lô đó.
   - Nút "Ảnh 01/2021 trên bản đồ" và "Ảnh mới nhất trên bản đồ" đổi ảnh nền ngay tại lô để so trước và sau mốc EUDR. Có thêm liên kết Esri Wayback, Copernicus Browser và Google Earth.
   - Hồ sơ lô hiện **lô rừng 2020 tại vị trí lô** (tiểu khu, khoảnh, lô, loại đất loại rừng, nguồn gốc, quy hoạch, chủ rừng, loài cây) theo bản đồ diễn biến rừng 2020 của tnr.vnforest.gov.vn, kèm ý nghĩa với EUDR. Thông tin lô rừng được lưu cùng kết quả kiểm tra.
   - Người kiểm tra ghi kết quả: Xem ảnh: ổn, Cần thực địa, Thực địa: ổn, hoặc Có vấn đề, kèm ghi chú. Trang lưu lịch sử từng lần ghi.
4. **Kế hoạch thực địa.** Các lô "Cần thực địa" được gom theo xã. Trong mỗi xã, lô được sắp theo thứ tự đi gần nhất và vẽ đường đi trên bản đồ. Có thể xuất GPX cho điện thoại hoặc CSV.
5. **Xuất kết quả.** CSV toàn bộ danh sách gồm mức ưu tiên, lý do, kết quả kiểm tra, cảnh báo dữ liệu và chỉ số từng bản đồ. Hồ sơ in (PDF) cho từng lô đã kiểm tra.

Danh sách và kết quả kiểm tra chỉ lưu trong trình duyệt (localStorage), không gửi lên máy chủ nào. Muốn lưu lâu dài thì xuất tệp.

## Mức ưu tiên

Tính trên lưới mẫu 500 m. Với lô đa giác, dùng mọi điểm lưới nằm trong lô. Với lô điểm hoặc lô nhỏ, dùng điểm lưới gần nhất.

| Mức | Điều kiện |
|---|---|
| **Cao** | Có mất tán cây sau 2020 (Hansen 2021–2025 hoặc JRC TMF), ở nơi ít nhất một bản đồ gọi là rừng năm 2020: GFC2020 V4, JRC TMF, Hansen, ESA WorldCover, hoặc bản đồ diễn biến rừng 2020 (tnr.vnforest.gov.vn) |
| **Trung bình** | Không có mất tán, nhưng các bản đồ không thống nhất về rừng năm 2020, hoặc GFC2020 V1 khác V4, hoặc mọi bản đồ đều gọi là rừng (lô cà phê ở đó là bất thường) |
| **Thấp** | Không bản đồ nào, kể cả bản đồ quốc gia, gọi là rừng năm 2020, và không có mất tán |

So với 1000 lô nghiên cứu có nhãn tham chiếu: cả 110 lô không tuân thủ đều ở mức Cao, không lô nào trong 177 lô mức Trung bình hoặc Thấp. Nhưng 46% lô mức Cao vẫn tuân thủ, nên mức Cao nghĩa là "cần xem", không phải "vi phạm". Mẫu nghiên cứu được chọn có chủ đích, nên các tỷ lệ này không đại diện cho diện tích. Đây cũng là lý do vẫn phải kiểm tra ngẫu nhiên các mức thấp hơn.

## Chạy trên máy

```bash
.venv/Scripts/python webapp/build_data.py --sheets       # public/data (~6 MB) và public/sheets (~154 MB)
PYTHONUTF8=1 .venv/Scripts/python webapp/build_lots.py   # public/data/lots/{z}/{x}/{y}.pbf: 892.942 lô rừng 2020, vài phút
python webapp/serve.py                                    # http://127.0.0.1:8765
node webapp/test_ui.mjs [thư mục ảnh chụp]                # kiểm tra tự động bằng Edge headless
```

| Tệp trong `public/data` | Nội dung |
|---|---|
| `grid.png` | Lưới 500 m (218.401 điểm), mã hóa thành bit: GFC2020 V1–V4, TMF, Hansen, WorldCover, năm mất tán, tỉnh, loại lô rừng 2020 của bản đồ quốc gia (xem đầu `build_data.py`) |
| `lots/{z}/{x}/{y}.pbf` | Lô rừng 2020 của 5 tỉnh (tnr.vnforest.gov.vn) dạng vector tile không nén, mức phóng 11–13 (phóng to hơn thì dùng lại tile mức 13): tiểu khu, khoảnh, lô, diện tích, loại đất loại rừng, nguồn gốc, quy hoạch, mục đích sử dụng, chủ rừng, loài cây, năm trồng, địa giới cũ |
| `items.geojson` | 1780 lô nghiên cứu: ranh giới, chỉ số bản đồ, NDVI, nhãn tham chiếu (ghi nguồn người hay mô hình), xác suất của mô hình chuỗi thời gian |
| `communes.geojson` | 264 xã sau sáp nhập 07/2025 phủ vùng 5 tỉnh (sapnhap.bando.com.vn, qua vietnamese-provinces-database, MIT), đã đơn giản hóa |
| `danh_sach_lo_mau.csv` | Danh sách mẫu: 580 lô cà phê 1 ha của nghiên cứu, cộng 4 dòng lỗi cố ý để thử phần kiểm tra dữ liệu |
| `meta.json` | Thống kê theo tỉnh, bảng mức ưu tiên so với nhãn tham chiếu |

Bản đồ diễn biến rừng 2020 lấy từ dịch vụ WFS công khai của tnr.vnforest.gov.vn và ghi nguồn trên trang. **Cần xác nhận điều khoản sử dụng với Cục Kiểm lâm trước khi công khai rộng.** Bản đồ cà phê FDP và Nature Trace không được đưa lên.

## Triển khai (đang dùng): GitHub + Cloudflare Pages

Thư mục `webapp/` là repo riêng tư **datrich/veudr-web**. Repo cha `LLM_4_deforest` bỏ qua thư mục này (khai báo trong `.git/info/exclude`). Cloudflare Pages đọc repo và phục vụ thư mục `public/` như trang tĩnh, không cần bước build. Mỗi lần `git push` lên nhánh `main`, Cloudflare tự triển khai lại.

Cài đặt một lần trên dashboard Cloudflare (tài khoản đang quản lý smlcloud.online):

1. **Workers & Pages → Create → Pages → Connect to Git** (hoặc *Import an existing Git repository*). Cấp cho ứng dụng Cloudflare trên GitHub quyền đọc repo `datrich/veudr-web`.
2. Build settings: *Framework preset* **None**, *Build command* **để trống**, *Build output directory* **`public`**, nhánh **`main`**. Bấm **Save and Deploy**.
3. Trong project vừa tạo: **Custom domains → Set up a custom domain → `veudr.smlcloud.online`**. DNS đã nằm ở Cloudflare nên bản ghi CNAME được tạo tự động; chứng chỉ HTTPS có sau vài phút.

Cập nhật dữ liệu hoặc mã: chạy lại `build_data.py` hoặc `build_lots.py` nếu cần, kiểm tra bằng `serve.py` và `test_ui.mjs`, rồi `git add -A && git commit && git push`.

Giới hạn của Cloudflare Pages cần nhớ: mỗi tệp tối đa 25 MiB, mỗi lần triển khai tối đa 20.000 tệp. Thư mục tile và 1780 ảnh bằng chứng nằm trong giới hạn này. `public/_headers` đặt thời gian cache cho tile và ảnh. `public/404.html` làm cho đường dẫn không tồn tại (tile trống) trả về lỗi 404 thay vì trang chủ.

## Các giai đoạn tiếp theo

**Giai đoạn 1 (trang này, chỉ gồm tệp tĩnh)** đang chạy trên Cloudflare Pages như trên, chi phí bằng 0. Trước khi dùng công khai lâu dài, cần kiểm tra điều khoản của ảnh Esri và của bản đồ diễn biến rừng 2020.

**Giai đoạn 2 (tính trên đúng ranh giới lô bất kỳ).** Cần API riêng (FastAPI, Docker, PostGIS). Với mỗi lô mới, API:
- lấy thống kê GFC2020, TMF, Hansen và cảnh báo GFW trên đúng đa giác của lô;
- lấy chuỗi Sentinel-2, Landsat và Sentinel-1, chạy mô hình chuỗi thời gian;
- tạo tấm bằng chứng như của 1780 lô nghiên cứu.

Nguồn ảnh: Google Earth Engine (dùng thương mại phải trả phí) hoặc Copernicus Data Space / openEO. Cần VPS 2–4 vCPU, 4–8 GB RAM và object storage.

Trước khi áp dụng cho doanh nghiệp, cần kiểm chứng mô hình trên một mẫu **lô thật có ranh giới thật**. Mô hình hiện được huấn luyện trên vùng cảnh báo và ô vuông 1 ha.

**Giai đoạn 3 (doanh nghiệp dùng thật).**
- Tài khoản, phân quyền và lưu kết quả trên máy chủ thay cho trình duyệt.
- Nhiều người kiểm tra trên cùng một danh sách.
- Nhật ký kiểm tra (audit log).
- Tự cảnh báo khi lô đã đăng ký có mất tán mới.
- Bảo vệ dữ liệu: tọa độ lô của nông hộ là dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.
