# StockProof

Nền tảng xác minh báo cáo tài chính ở cấp độ từng claim (**Claim-level Financial Verification**) cho doanh nghiệp niêm yết Việt Nam, kết hợp quy trình duyệt thủ công (**Human-in-the-Loop — HITL**) và ghi nhận bằng chứng lên **Avalanche Fuji C-Chain**.

## 1. Luồng hoạt động chính

```text
Buyer Agent nhận báo cáo (10 claims) từ Seller Agent
  → StockProof Verification Engine đối chiếu từng claim với dữ liệu chuẩn
  → Phát hiện sai lệch có chủ đích & phân loại 4 trạng thái
  → Duyệt thủ công (HITL) cho claim cần kiểm toán viên đánh giá
  → Tạo Evidence Report & tính mã băm SHA-256 chuẩn hóa
  → Ghi hash & trạng thái xác minh lên Avalanche Fuji (kèm Tx Hash & link Fuji Explorer)
  → Người mua (Buyer) xem kết quả và quyết định Chấp nhận hoặc Yêu cầu sửa
```

## 2. Tính năng & Phạm vi MVP

- **Doanh nghiệp & kỳ báo cáo chuẩn**: CTCP FPT (`HOSE: FPT`) — Báo cáo tài chính hợp nhất `FY2025` (`src/data/fptSeedData.ts`).
- **Bộ 10 Claims từ Seller Agent**: Hỗ trợ 2 kịch bản cài sẵn (`Demo Report (Intentional Faults)` và `Revised Clean Report (10/10)`) và chỉnh sửa trực tiếp từng claim để kiểm thử.
- **Verification Engine (`src/lib/verification.ts`)**: Kiểm tra xác định qua 5 rule độc lập:
  1. **Source**: Kiểm tra sự tồn tại của nguồn dẫn chứng đối chiếu.
  2. **Period**: Đối chiếu kỳ báo cáo (`FY2025` vs sai kỳ như `Q3/2025`).
  3. **Unit**: Đối chiếu đơn vị tính (`tỷ VND`, `%`, `lần` vs sai đơn vị `triệu VND`).
  4. **Formula**: Kiểm tra công thức chỉ tiêu phái sinh (`GROSS_PROFIT`, `GROSS_MARGIN`, `TOTAL_LIABILITIES`, `DEBT_TO_EQUITY`).
  5. **Value**: Đối chiếu độ lệch số liệu theo ngưỡng sai số cho phép.
- **Bốn trạng thái xác minh**:
  - `Verified` — Khớp dữ liệu chuẩn và hợp lệ mọi rule.
  - `Mismatch` — Sai số liệu, sai kỳ, sai đơn vị hoặc sai công thức.
  - `Insufficient Evidence` — Thiếu nguồn dẫn chứng hoặc thiếu giá trị đối chiếu.
  - `Needs Human Review` — Sai lệch nằm trong vùng cần kiểm toán viên duyệt thủ công (**HITL**).
- **Dashboard & HITL**: Hiển thị giá trị Seller, giá trị chuẩn, mức chênh lệch, lý do, nguồn dẫn chứng, chi tiết 5 rule kiểm tra, form duyệt HITL và quyết định cuối cùng của Buyer (`Accept Report` / `Request Revision`).
- **Avalanche Fuji & Smart Contract (`contracts/StockProofRegistry.sol`)**: Tạo mã băm SHA-256 của Evidence Report, truy vấn block mới nhất từ Avalanche Fuji RPC (`Chain ID 43113`), hỗ trợ ghi nhận on-chain (qua server RPC record hoặc ký trực tiếp bằng ví Web3 EIP-1193), trả về **Transaction Hash** và link mở trên **Fuji Explorer** (Snowtrace).
- **Song ngữ (`EN` / `VI`)**: Chuyển đổi ngôn ngữ giao diện trực tiếp trên thanh công cụ.

## 3. Công nghệ sử dụng

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React
- **Backend**: Node.js, Express (`server.ts`), Vite middleware (dev) & lưu trữ JSON cục bộ (`data/stockproof-db.json`)
- **Blockchain**: Solidity `^0.8.20` (`contracts/StockProofRegistry.sol`), Avalanche Fuji C-Chain JSON-RPC (`https://api.avax-test.network/ext/bc/C/rpc`)
- **Testing**: `node:test` + `tsx`

## 4. Cấu trúc thư mục

```text
├── contracts/
│   └── StockProofRegistry.sol      # Smart contract lưu hash Evidence Report & quyết định Buyer
├── src/
│   ├── components/
│   │   ├── BuyerDecisionBar.tsx    # Thanh quyết định Accept Report / Request Revision
│   │   ├── ClaimInspector.tsx      # Chi tiết 5 rule kiểm tra & form duyệt HITL
│   │   ├── ClaimsTable.tsx         # Bảng 10 claims kèm bộ lọc trạng thái & tìm kiếm
│   │   ├── EvidenceFujiView.tsx    # Evidence Report SHA-256, Fuji Explorer & contract viewer
│   │   ├── PipelineStepper.tsx     # Thanh tiến trình 6 bước từ Buyer Agent đến Buyer Decision
│   │   ├── SellerGroundTruthView.tsx # Chỉnh sửa báo cáo Seller & xem dữ liệu chuẩn HOSE: FPT
│   │   ├── Sidebar.tsx             # Điều hướng 3 màn hình chính của ứng dụng
│   │   ├── StatusBadge.tsx         # Hiển thị 4 trạng thái xác minh
│   │   └── TopBar.tsx              # Header breadcrumb & nút chạy Verification Engine
│   ├── data/
│   │   └── fptSeedData.ts          # Dữ liệu chuẩn FPT FY2025 & kịch bản lỗi mẫu
│   ├── lib/
│   │   ├── i18n.ts                 # Từ điển giao diện EN / VI
│   │   ├── verification.ts         # Verification Engine, Evidence Report builder & SHA-256
│   │   └── verification.test.ts    # Unit test cho Verification Engine & HITL
│   ├── types/
│   │   └── stockproof.ts           # Định nghĩa kiểu TypeScript toàn hệ thống
│   ├── App.tsx                     # Giao diện chính điều phối các luồng nghiệp vụ
│   └── main.tsx
├── server.ts                       # Express API & Vite dev/production server (port 3000)
└── package.json
```

## 5. Hướng dẫn cài đặt & chạy cục bộ

### Yêu cầu môi trường
- Node.js `>= 20` (khuyến nghị Node `22+`)
- `npm`

### Cài đặt dependencies

```bash
npm install
```

### Chạy môi trường phát triển (Full-stack trên cổng `3000`)

```bash
npm run dev
```

Truy cập ứng dụng tại `http://localhost:3000`.

### Chạy Unit Tests

```bash
npx --yes tsx --test src/lib/verification.test.ts
```

### Kiểm tra TypeScript & Build Production

```bash
npm run lint
npm run build
npm start
```

## 6. Danh sách API Endpoints (`server.ts`)

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `GET` | `/api/health` | Kiểm tra trạng thái hoạt động của API |
| `GET` | `/api/workspace` | Lấy toàn bộ trạng thái workspace, 10 claims, Evidence Report và Fuji anchor |
| `POST` | `/api/verify` | Chạy Verification Engine cho bộ claims gửi lên và sinh SHA-256 Evidence Report |
| `POST` | `/api/claims/:claimId/hitl` | Ghi nhận quyết định duyệt thủ công HITL (`Verified` hoặc `Mismatch`) và tính lại hash |
| `POST` | `/api/anchor-fuji` | Truy vấn block Avalanche Fuji RPC và ghi nhận Evidence Report hash lên sổ cái |
| `POST` | `/api/buyer-decision` | Lưu quyết định cuối cùng của Buyer (`Accepted` hoặc `Revision Requested`) |
| `POST` | `/api/reset` | Đặt lại kịch bản mẫu (`faulty-demo` hoặc `clean-revised`) |
| `GET` | `/api/fuji-status` | Kiểm tra block hiện tại trên Avalanche Fuji C-Chain (`Chain ID 43113`) |
| `GET` | `/api/contract-source` | Trả về mã nguồn `contracts/StockProofRegistry.sol` |
