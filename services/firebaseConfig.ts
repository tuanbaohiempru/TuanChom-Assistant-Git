
import * as firebaseApp from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// --- Cấu hình Firebase ---
// Ưu tiên sử dụng biến môi trường (Environment Variables) để dễ dàng deploy sang project khác.
// Nếu không tìm thấy biến môi trường, sẽ sử dụng cấu hình mặc định (Demo Project).

const defaultProject = "studio-5841594141-93fc7";

const configFromEnv = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const defaultConfig = {
  apiKey: "AIzaSyBucXUKg5bsEv7mmVA2q3t5g2zzKvpA7qQ",
  authDomain: `${defaultProject}.firebaseapp.com`,
  projectId: defaultProject,
  storageBucket: `${defaultProject}.firebasestorage.app`,
  messagingSenderId: "148389290808",
  appId: "1:148389290808:web:33a5e679e7b0d54324d7cd"
};

// Logic: Chỉ dùng Config từ Env nếu có Project ID hợp lệ, ngược lại dùng Default
const useEnv = !!configFromEnv.projectId;
const firebaseConfig = (useEnv ? configFromEnv : defaultConfig) as any;

console.log("Firebase Config Loaded:", { 
    projectId: firebaseConfig.projectId, 
    source: useEnv ? "Environment Variables (Production)" : "Default Hardcoded (Demo)" 
});

if (!useEnv) {
    console.warn(
        "%cLƯU Ý: Ứng dụng đang chạy ở chế độ Demo với cấu hình mặc định.\n" +
        "Để deploy cho cá nhân, vui lòng tạo file .env và cấu hình VITE_FIREBASE_... " +
        "Xem hướng dẫn trong README.md",
        "color: orange; font-weight: bold; font-size: 12px;"
    );
}

// Khởi tạo Firebase
const app = (firebaseApp as any).initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app); // Default region
const googleProvider = new GoogleAuthProvider();

export { db, storage, auth, functions, googleProvider };
