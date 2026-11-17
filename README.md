# StockProof — Nền tảng xác minh báo cáo tài chính ứng dụng Blockchain

**Xác minh mọi chỉ tiêu tài chính.**

StockProof là ứng dụng MVP toàn diện giúp đối chiếu độc lập từng chỉ tiêu tài chính do AI Agent tạo ra với bộ dữ liệu báo cáo tài chính chuẩn, xuất báo cáo bằng chứng 15 phần (trên trình duyệt, PDF Unicode, JSON), hỗ trợ kiểm toán viên duyệt thủ công (**Human-in-the-Loop — HITL**) và lưu dấu mã băm SHA-256 lên **Avalanche Fuji Testnet**.

> **Phạm vi bất biến**: Việc ghi nhận lên Blockchain chứng minh bản ghi xác minh và mã băm bằng chứng không bị chỉnh sửa sau thời điểm đăng ký. Blockchain **không** tự động chứng thực số liệu trong báo cáo nguồn gốc ban đầu là hoàn toàn không có sai sót.

---

## 1. Luồng nghiệp vụ chính

```text
Buyer Agent → Seller Agent → Bộ máy xác minh StockProof → Báo cáo bằng chứng → Bản ghi Blockchain
```

1. **Tải báo cáo & Trích xuất (`/upload`)**: Kéo thả tệp `PDF`, `XLSX`, `XLS`, `CSV` hoặc `JSON`. Hệ thống băm tệp ngoài chuỗi (`SHA-256`), trích xuất nội dung (`pdfjs-dist` / `xlsx`) và ánh xạ chỉ tiêu có cấu trúc bằng Gemini AI phía máy chủ (`@google/genai`) hoặc bộ phân tích bảng xác định.
2. **Bộ máy xác minh xác định (`src/lib/verification.ts`)**: Kiểm tra độc lập từng chỉ tiêu theo 8 quy tắc (Độ chính xác số liệu theo ngưỡng sai số, Kỳ báo cáo, Quy đổi đơn vị `VND` / `Triệu VND` / `Tỷ VND`, Phạm vi báo cáo `Hợp nhất` / `Công ty mẹ`, Tính toán lại công thức, Đầy đủ nguồn trích dẫn và Kích hoạt duyệt thủ công HITL).
3. **Kiểm toán viên duyệt thủ công (`/verification`)**: Xem bảng so sánh đối chiếu Seller Agent vs Dữ liệu chuẩn, kiểm tra chi tiết từng quy tắc, sửa số liệu kèm nhận xét bắt buộc và lưu dấu `HUMAN_APPROVED`.
4. **Hồ sơ bằng chứng (`/evidence`)**: Hiển thị đầy đủ 15 phần báo cáo bằng chứng kèm tải tệp **PDF** hỗ trợ tiếng Việt (`pdfkit` + `DejaVuSans`) và xuất **JSON**.
5. **Sổ cái Blockchain (`/blockchain`)**: Lưu mã băm tài liệu và mã băm bằng chứng qua hợp đồng thông minh `contracts/StockProofRegistry.sol` trên **Avalanche Fuji Testnet (`Chain ID 43113`)** bằng ví EVM (`LIVE_FUJI_WALLET`) hoặc chế độ mô phỏng `DEMO_SIMULATION`.

---

## 2. Kịch bản dữ liệu mẫu (`DỮ LIỆU MẪU`)

Bộ dữ liệu khởi tạo mặc định: **Công ty Cổ phần FPT (DỮ LIỆU MẪU)** (`HOSE: FPT`, `FY2025`, Hợp nhất) gồm 10 chỉ tiêu:
- **5 Đã xác minh** (bao gồm quy đổi đơn vị tự động từ `7.857.000 Triệu VND` → `7.857 Tỷ VND`)
- **2 Sai lệch** (Vốn chủ sở hữu lấy nhầm kỳ `Q3/2025` và Tăng trưởng doanh thu sai công thức `18,5%` so với `12,3%`)
- **1 Thiếu bằng chứng** (Nợ phải trả thiếu tài liệu nguồn và số trang)
- **2 Cần duyệt thủ công** (Lợi nhuận thuần từ HĐKD có điều chỉnh tỷ giá Thuyết minh V.24 và Lưu chuyển tiền tệ có xung đột biên bản nội bộ)

---

## 3. Công nghệ sử dụng

- **Giao diện (Frontend)**: React 19, TypeScript, Tailwind CSS v4, Lucide React, Ethers.js v6
- **Máy chủ (Backend)**: Express (`server.ts`), Vite middleware, Multer, `pdfjs-dist`, `xlsx`, `pdfkit`, `@google/genai`
- **Cơ sở dữ liệu**: PostgreSQL (Cloud SQL + Drizzle ORM tại `src/db/`) kèm tệp JSON cục bộ (`data/stockproof-demo.json`) cho chế độ Demo
- **Xác thực**: Firebase Authentication (Đăng nhập Google)
- **Hợp đồng thông minh**: Solidity (`contracts/StockProofRegistry.sol`) cho Avalanche Fuji Testnet (`Chain ID 43113`)

---

## 4. Danh sách API (`server.ts`)

| Phương thức | Đường dẫn | Mô tả |
| --- | --- | --- |
| `GET` | `/api/health` | Kiểm tra tình trạng API |
| `POST` | `/api/auth/session` | Đồng bộ phiên người dùng Firebase với PostgreSQL |
| `GET` | `/api/workspace` | Tải danh sách báo cáo, bộ dữ liệu chuẩn, hoạt động và trạng thái Fuji |
| `GET` | `/api/sample-report` | Tải tệp mẫu `CSV` hoặc `JSON` (`?format=csv\|json`) |
| `POST` | `/api/reports/upload` | Tải lên PDF/XLSX/CSV/JSON, băm SHA-256, trích xuất & xác minh |
| `POST` | `/api/reports/:reportId/claims` | Lưu chỉnh sửa chỉ tiêu và xác minh lại |
| `POST` | `/api/reports/:reportId/claims/:claimId/review` | Lưu quyết định HITL (`VERIFIED`, `MISMATCH`, `INSUFFICIENT EVIDENCE`) |
| `GET` | `/api/reports/:reportId/evidence.pdf` | Tạo và tải báo cáo bằng chứng định dạng PDF |
| `POST` | `/api/reports/:reportId/blockchain` | Lưu giao dịch Avalanche Fuji (`LIVE_FUJI_WALLET`) hoặc `DEMO_SIMULATION` |
| `POST` | `/api/settings/tolerance` | Cập nhật ngưỡng sai số (`%`) và xác minh lại |
| `POST` | `/api/reset` | Khôi phục kịch bản dữ liệu mẫu FPT |
| `GET` | `/api/fuji-status` | Truy vấn block mới nhất trên Avalanche Fuji RPC |
| `GET` | `/api/contract-source` | Trả về mã nguồn `contracts/StockProofRegistry.sol` |

---

## 5. Cài đặt & Chạy thử nghiệm

```bash
# 1. Cài đặt thư viện
npm install

# 2. Cấu hình biến môi trường (tùy chọn cho Demo; cần thiết cho Gemini PDF & Cloud SQL)
cp .env.example .env

# 3. Chạy Unit Test
npx --yes tsx --test src/lib/verification.test.ts

# 4. Chạy môi trường phát triển trên cổng 3000
npm run dev

# 5. Kiểm tra TypeScript & Build Production
npm run lint
npm run build
npm start
```
