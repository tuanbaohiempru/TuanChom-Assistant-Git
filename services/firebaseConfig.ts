import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Cấu hình Firebase lấy từ biến môi trường
// Bạn cần tạo file .env và điền các giá trị này vào
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Kiểm tra xem cấu hình có đầy đủ không
const isConfigured = Object.values(firebaseConfig).every(val => !!val);

if (!isConfigured) {
    console.warn("⚠️ Cảnh báo: Chưa cấu hình đầy đủ thông tin Firebase trong file .env. Ứng dụng có thể không hoạt động đúng.");
}

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };