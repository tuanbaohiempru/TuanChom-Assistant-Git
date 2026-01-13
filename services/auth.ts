
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { auth, googleProvider } from "./firebaseConfig";

const checkAuthReady = () => {
    if (!auth) throw new Error("Hệ thống chưa kết nối Firebase. Vui lòng kiểm tra file .env");
};

/**
 * Đăng nhập bằng Google
 */
export const loginWithGoogle = async (): Promise<User | null> => {
    checkAuthReady();
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
};

/**
 * Đăng nhập bằng Email/Password
 */
export const loginWithEmail = async (email: string, pass: string): Promise<User> => {
    checkAuthReady();
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error) {
        console.error("Email Login Error:", error);
        throw error;
    }
};

/**
 * Đăng ký tài khoản mới bằng Email/Password
 */
export const registerWithEmail = async (email: string, pass: string): Promise<User> => {
    checkAuthReady();
    try {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error) {
        console.error("Registration Error:", error);
        throw error;
    }
};

/**
 * Đăng xuất
 */
export const logout = async () => {
    if (!auth) return;
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
    }
};

/**
 * Lắng nghe trạng thái đăng nhập
 */
export const subscribeToAuth = (callback: (user: User | null) => void) => {
    if (!auth) {
        callback(null);
        return () => {};
    }
    return onAuthStateChanged(auth, (user) => {
        callback(user);
    });
};
