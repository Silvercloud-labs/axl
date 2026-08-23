# FAQ — Câu Hỏi Thường Gặp

---

### AXL có phải là mã nguồn mở không, hay chỉ miễn phí?

**Mã nguồn mở.** Apache License 2.0, giấy phép được OSI chấp thuận. Bạn có thể đọc, chạy, chỉnh sửa, phân phối lại, fork nó và bán phần mềm xây dựng trên đó — thương mại, không cần xin phép và không mất phí.

Không có phân chia open-core, không có cấp độ trả phí, không có telemetry, và không có tính năng nào bị giữ lại. Toàn bộ toolchain đều có trong repo này.

### Tại sao Apache 2.0 chứ không phải MIT?

| | MIT | Apache 2.0 |
|---|---|---|
| Tự do sử dụng, chỉnh sửa, bán | Có | Có |
| Cấp phép bằng sáng chế rõ ràng | Không | Có |
| Bảo vệ nhãn hiệu tên | Không | Có |
| Yêu cầu khai báo thay đổi | Không | Có |

### Đã sẵn sàng cho môi trường production chưa?

**Chưa, và câu trả lời thực tế là chưa có gì được triển khai.**

| | Trạng thái |
|---|---|
| Compiler, runtime, CLI | Hoạt động, 750 test đều pass |
| Đã công bố trên npm | Chưa. Phiên bản đầu tiên chưa được phát hành |
| Tiện ích VS Code trên Marketplace | Chưa. Build từ nguồn |
| Được sử dụng trong production | Theo chúng tôi biết, chưa |

### AXL không làm gì?

| Ngoài phạm vi | Lý do |
|---|---|
| Auth, thanh toán, cơ sở hạ tầng danh tính | Trách nhiệm của backend. AXL không bao giờ phát hành, lưu trữ hoặc xác minh thông tin xác thực |
| Tích hợp OAuth | Hoàn toàn thuộc backend |
| Cơ sở dữ liệu hoặc ORM | AXL không lưu trữ dữ liệu domain |
| Tương đương MCP đầy đủ | Không có Prompts, Notifications, Progress tracking hoặc Roots |
| Phân tích mã nguồn ứng dụng | `axl adapt` đọc đặc tả API |
| Giao dịch bù trừ | Workflow thất bại không rollback các bước đã hoàn thành |

### Tôi có phải viết lại backend không?

Không. AXL không bao giờ thay thế backend của bạn — nó đứng trước backend và gọi qua HTTP.

### Làm thế nào để báo cáo vấn đề bảo mật?

Không phải trong issue công khai. Sử dụng báo cáo lỗ hổng riêng tư của GitHub — xem [SECURITY.md](SECURITY.md).

### Tôi có thể đóng góp như thế nào?

Xem [CONTRIBUTING.md](CONTRIBUTING.md).

---

Còn thiếu gì đó? [Mở một issue](https://github.com/Silvercloud-labs/axl/issues).
