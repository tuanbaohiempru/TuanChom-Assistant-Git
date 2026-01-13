
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions, Functions } from "firebase/functions";

// --- Cấu hình Firebase ---

// 1. Cố gắng lấy từ biến môi trường (.env)
const envConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// 2. Nếu không có biến môi trường, thử lấy từ LocalStorage (Người dùng nhập tay)
const getStoredConfig = () => {
    try {
        const stored = localStorage.getItem('firebase_config');
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        return null;
    }
};

const storedConfig = getStoredConfig();

// Ưu tiên biến môi trường, sau đó đến LocalStorage
const firebaseConfig = (envConfig.apiKey && envConfig.projectId) ? envConfig : storedConfig;

// Use 'any' to bypass strict type checks causing issues with mixed compat/modular types
let app: any;
let db: any; // Compat Firestore instance
let storage: FirebaseStorage;
let auth: Auth;
let functions: Functions;
let googleProvider: GoogleAuthProvider;

// EXPORT DIRECTLY HERE TO FIX IMPORT ERROR
export let isFirebaseReady = false;

// Kiểm tra tính hợp lệ của cấu hình
if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
        console.log("✅ Firebase Config Loaded:", { projectId: firebaseConfig.projectId, source: envConfig.apiKey ? 'ENV' : 'LocalStorage' });
        // Initialize using Compat API to ensure 'db' is created correctly even if modular exports fail
        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }
        
        db = app.firestore();
        // Use Modular API getters where possible, passing the compat app instance (which is compatible)
        storage = getStorage(app);
        auth = getAuth(app);
        functions = getFunctions(app); // Default region
        googleProvider = new GoogleAuthProvider();
        isFirebaseReady = true;
    } catch (e) {
        console.error("❌ Firebase Initialization Error:", e);
        // Nếu config lưu trong storage bị lỗi, xóa đi để user nhập lại
        if(storedConfig) {
            console.warn("⚠️ Detected invalid localStorage config. Clearing...");
            localStorage.removeItem('firebase_config');
        }
    }
} else {
    console.warn("⚠️ Firebase configuration missing. Waiting for user input.");
}

export const saveFirebaseConfig = (config: any) => {
    localStorage.setItem('firebase_config', JSON.stringify(config));
    window.location.reload(); // Reload để apply config mới
};

export const clearFirebaseConfig = () => {
    localStorage.removeItem('firebase_config');
    localStorage.removeItem('gemini_api_key');
    window.location.reload();
};

// Cast to types to satisfy strict null checks elsewhere, 
// but consumers must rely on isFirebaseReady or App.tsx guarding.
export { 
    db, 
    storage, 
    auth, 
    functions, 
    googleProvider
};
