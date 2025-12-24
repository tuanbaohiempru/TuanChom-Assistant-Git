
import * as firebaseApp from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Cấu hình Firebase lấy từ biến môi trường
// Bạn cần tạo file .env và điền các giá trị này vào
const firebaseConfig = {
  apiKey: "AIzaSyBsZ1JcSgpOyOXHfGXUysxeNtafOigebUg",
  authDomain: "gen-lang-client-0783227587.firebaseapp.com",
  projectId: "gen-lang-client-0783227587",
  storageBucket: "gen-lang-client-0783227587.firebasestorage.app",
  messagingSenderId: "417822947960",
  appId: "1:417822947960:web:4be31b9ee9dafeddfdcb8d",
  measurementId: "G-C34N464ZBX"
};

// Kiểm tra xem cấu hình có đầy đủ không
const isConfigured = Object.values(firebaseConfig).every(val => !!val);

if (!isConfigured) {
    console.warn("⚠️ Cảnh báo: Chưa cấu hình đầy đủ thông tin Firebase trong file .env. Ứng dụng có thể không hoạt động đúng.");
}

// Khởi tạo Firebase
const app = (firebaseApp as any).initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
