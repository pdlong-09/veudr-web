# Nhận diện phiên bản / Version identity

**Phiên bản này của vEUDR do Phạm Duy Long công bố và duy trì.**
*This version of vEUDR is published and maintained by Phạm Duy Long.*

| | |
|---|---|
| Chủ sở hữu phiên bản | **Phạm Duy Long** |
| Tài khoản GitHub | [@pdlong-09](https://github.com/pdlong-09) |
| Repo | https://github.com/pdlong-09/veudr-web |
| Ngày công bố | 27/10/2026 |
| Trang web đang chạy | https://veudr.smlcloud.online |

## Nội dung được nhận diện

Phần nhận diện này gắn với đúng nội dung của commit `60f83e60a64bc7791f7419abcea02d23a3c524e4`:

| | |
|---|---|
| Cây tệp (git tree) | `f0e044206be686cd3dfb4e30ed0c24fd087583cf` |
| Số tệp | 5.271 |
| SHA-256 của danh sách tệp (`git ls-tree -r`) | `84a8c82cb3a7dcdc4f93b428fa38dcf049b0cc4b1426ff71db481f688af35334` |

Mã băm của git thay đổi khi bất kỳ tệp nào thay đổi dù chỉ một ký tự. Một bản sao giữ đúng ba giá trị trên tức là giữ nguyên nội dung của phiên bản này.

## Chữ ký

Commit thêm tệp này được tạo trực tiếp bằng tài khoản **pdlong-09** trên GitHub. GitHub tự ký commit này, và huy hiệu **Verified** hiện cạnh commit trong lịch sử repo. Huy hiệu xác nhận chính tài khoản pdlong-09 đã công bố phần nhận diện, vào đúng thời điểm ghi trên commit.

## Tự kiểm chứng

```bash
git clone https://github.com/pdlong-09/veudr-web.git && cd veudr-web
git rev-parse 60f83e60a64bc7791f7419abcea02d23a3c524e4^{tree}         # f0e044206be686cd3dfb4e30ed0c24fd087583cf
git ls-tree -r 60f83e60a64bc7791f7419abcea02d23a3c524e4 | wc -l        # 5271
git ls-tree -r 60f83e60a64bc7791f7419abcea02d23a3c524e4 | sha256sum    # 84a8c82c…f35334
git log --show-signature -1 -- SIGNATURE.md                             # commit của pdlong-09, chữ ký của GitHub
```

## Nguồn gốc

Phiên bản dựa trên dự án nghiên cứu vEUDR: [datrich/vEUDR](https://github.com/datrich/vEUDR) và bộ dữ liệu [EUDR-CH](https://www.kaggle.com/datasets/somebodyknow/eudr-ch). Lịch sử commit trước đó được giữ nguyên, kèm tác giả gốc của từng commit. Nguồn và giấy phép của từng lớp dữ liệu nằm ở trang Dữ liệu của web.

## Giới hạn

Tệp này và huy hiệu Verified xác nhận **tài khoản GitHub nào** đã công bố phiên bản và **nội dung nào** được công bố. Đây **không phải chữ ký số có giá trị pháp lý** theo Luật Giao dịch điện tử. Chữ ký số pháp lý cần chứng thư số do tổ chức cung cấp dịch vụ chứng thực chữ ký số cấp.
