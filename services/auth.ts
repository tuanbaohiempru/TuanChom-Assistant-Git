
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { auth, googleProvider } from "./firebaseConfig";

/**
 * Đăng nhập bằng Google
 */
export const loginWithGoogle = async (): Promise<User | null> => {
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
    return onAuthStateChanged(auth, (user) => {
        callback(user);
    });
};
