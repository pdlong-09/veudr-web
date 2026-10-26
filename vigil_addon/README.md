# Mục "vEUDR" trên thanh điều hướng của vigil.green

vigil.green (Next.js, Docker, trên server riêng) có thêm mục **vEUDR ↗** ở cuối thanh điều hướng, trỏ tới https://veudr.smlcloud.online. Mục này nằm ở cả thanh trên máy tính lẫn menu trên điện thoại.

**Mã và image của vigil.green không bị sửa.** Image đang chạy được build ngày 09/10 từ một bản mã khác bản ở máy (`package.json` khác nhau), nên build lại có thể làm đổi nội dung. Cách làm là chèn thêm ở tầng nginx:

- `/var/www/vigil-addon/veudr-link.js`: chờ React gắn xong thanh điều hướng, chờ thêm cho trình duyệt rảnh, rồi thêm một liên kết cùng kiểu với các mục có sẵn. Dùng `MutationObserver` để gắn lại khi menu điện thoại mở hoặc thanh điều hướng được dựng lại.
- `/etc/nginx/sites-available/vigil`: chỉ **thêm** các dòng có ghi chú `vEUDR`:
  - `sub_filter` chèn `<script src="/__veudr/veudr-link.js?v=3" defer>` trước `</body>` của trang HTML;
  - `proxy_set_header Accept-Encoding ""` để nginx đọc được HTML chưa nén;
  - `gzip_proxied any` và `gzip_types` để nginx tự nén thay cho Next.js.
- Bản sao lưu cấu hình gốc: `/root/nginx-vigil.bak-20261026-190710`.

Đã kiểm tra ngày 26/10/2026:
- chữ hiển thị trên 5 trang (/, /about, /map, /publication, /contact) giống hệt trước khi thêm;
- không có lỗi console;
- 0 lỗi hydration React trên 48 lần tải (máy tính và điện thoại, có và không có script).

Phiên bản đầu chèn quá sớm, gây lỗi React #418 khoảng 1 trên 6 lần tải. Phiên bản hiện tại đã sửa lỗi này.

**Sửa script:** chỉnh `veudr-link.js`, tăng `?v=` trong `update.py`, rồi chạy `VPS_HOST=<IP server> VPS_PW=... python update.py`.

**Gỡ bỏ:** khôi phục bản sao lưu, `cp /root/nginx-vigil.bak-20261026-190710 /etc/nginx/sites-available/vigil && nginx -t && systemctl reload nginx`, rồi xóa `/var/www/vigil-addon/`.
