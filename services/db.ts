
import { db } from "./firebaseConfig";

// Tên các Collection trong Firestore
const COLLECTIONS = {
    CUSTOMERS: 'customers',
    CONTRACTS: 'contracts',
    PRODUCTS: 'products',
    APPOINTMENTS: 'appointments',
    SETTINGS: 'settings', 
    MESSAGE_TEMPLATES: 'message_templates',
    ILLUSTRATIONS: 'illustrations' // New
};

// --- GENERIC FUNCTIONS ---

/**
 * Lắng nghe dữ liệu realtime từ một collection
 */
export const subscribeToCollection = (collectionName: string, callback: (data: any[]) => void) => {
    // Mặc định sắp xếp theo ngày tạo hoặc ID nếu không có field created_at
    // Using Compat API syntax: db.collection()
    return db.collection(collectionName).onSnapshot((snapshot: any) => {
        const data = snapshot.docs.map((doc: any) => ({
            ...doc.data(),
            id: doc.id 
        }));
        callback(data);
    }, (error: any) => {
        console.error(`Error fetching ${collectionName}:`, error);
    });
};

/**
 * Thêm mới dữ liệu
 */
export const addData = async (collectionName: string, data: any) => {
    try {
        const { id, ...cleanData } = data; 
        await db.collection(collectionName).add(cleanData);
    } catch (e) {
        console.error("Error adding document: ", e);
        throw e;
    }
};

/**
 * Cập nhật dữ liệu
 */
export const updateData = async (collectionName: string, id: string, data: any) => {
    try {
        const { id: dataId, ...cleanData } = data; 
        await db.collection(collectionName).doc(id).update(cleanData);
    } catch (e) {
        console.error("Error updating document: ", e);
        throw e;
    }
};

/**
 * Xóa dữ liệu
 */
export const deleteData = async (collectionName: string, id: string) => {
    try {
        await db.collection(collectionName).doc(id).delete();
    } catch (e) {
        console.error("Error deleting document: ", e);
        throw e;
    }
};

// Export tên collection để dùng ở App
export { COLLECTIONS };
