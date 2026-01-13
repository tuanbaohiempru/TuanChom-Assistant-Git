
# TuanChom - Ứng dụng Quản lý Tư vấn Bảo hiểm

Đây là ứng dụng web dành riêng cho tư vấn viên bảo hiểm Prudential, giúp quản lý khách hàng, hợp đồng, và tư vấn sản phẩm với sự hỗ trợ của AI.

## 🚀 Hướng dẫn Deploy lên Firebase (Cá nhân)

Để ứng dụng chạy trên tài khoản Firebase của riêng bạn (thay vì Demo), hãy làm theo các bước sau:

### 1. Tạo Project Firebase
1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Tạo project mới (ví dụ: `tuanchom-manager`).
3. Bật **Authentication** (Google & Email/Password).
4. Bật **Firestore Database** (Start in Test mode hoặc Production).
5. Bật **Storage**.
6. Bật **Functions** (Cần nâng cấp gói Blaze - Pay as you go, nhưng có hạn mức miễn phí rộng rãi).

### 2. Lấy Cấu hình Firebase
1. Trong Project Settings -> General -> Your apps -> Add App (Web).
2. Copy các thông số config (`apiKey`, `authDomain`, `projectId`, ...).

### 3. Cấu hình Môi trường (Environment Variables)
Tạo file `.env` tại thư mục gốc và điền thông tin:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Cấu hình Backend (Cloud Functions)
Di chuyển vào thư mục `functions` và tạo file `.env`:

```bash
cd functions
# Tạo file .env với nội dung:
API_KEY=your_google_ai_studio_api_key
```
*Lưu ý: Lấy API Key Gemini tại [Google AI Studio](https://aistudio.google.com/).*

### 5. Cấu hình CORS cho Storage (QUAN TRỌNG)
Để AI đọc được file PDF từ trình duyệt, bạn cần cấu hình CORS cho Storage Bucket.
Mở Cloud Shell trên Google Console hoặc dùng `gsutil` trên máy:

```bash
# Tạo file cấu hình tạm
echo '[{"origin": ["*"],"method": ["GET"],"maxAgeSeconds": 3600}]' > cors.json

# Áp dụng (Thay tên bucket của bạn vào)
gsutil cors set cors.json gs://[YOUR_BUCKET_NAME]
```

### 6. Deploy
Cài đặt Firebase CLI nếu chưa có: `npm install -g firebase-tools`

```bash
# Đăng nhập
firebase login

# Chọn project của bạn
firebase use --add

# Deploy toàn bộ (Frontend + Backend)
npm run build
firebase deploy
```

## ✨ Tính năng chính
- **CRM**: Quản lý khách hàng, lịch sử tương tác, mối quan hệ gia đình.
- **Hợp đồng**: Quản lý hợp đồng, nhắc phí tự động.
- **AI Assistant**: Chat với tài liệu sản phẩm, gợi ý xử lý từ chối, soạn tin nhắn mẫu.
- **Hoạch định tài chính**: Tính toán quỹ hưu trí, học vấn, bảo vệ.
