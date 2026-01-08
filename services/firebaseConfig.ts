
import * as firebaseApp from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// Cấu hình Firebase lấy từ biến môi trường
const firebaseConfig = {
  apiKey: "AIzaSyBucXUKg5bsEv7mmVA2q3t5g2zzKvpA7qQ",
  authDomain: "studio-5841594141-93fc7.firebaseapp.com",
  projectId: "studio-5841594141-93fc7",
  // Fix: Storage Bucket mặc định thường có đuôi .appspot.com
  storageBucket: "studio-5841594141-93fc7.appspot.com", 
  messagingSenderId: "148389290808",
  appId: "1:148389290808:web:33a5e679e7b0d54324d7cd"
};

// Khởi tạo Firebase
const app = (firebaseApp as any).initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app); // Default region
const googleProvider = new GoogleAuthProvider();

export { db, storage, auth, functions, googleProvider };
