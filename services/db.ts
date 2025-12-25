
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    orderBy,
    QuerySnapshot,
    DocumentData
} from "firebase/firestore";
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
    const q = query(collection(db, collectionName));
    
    return onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
        const data = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id 
        }));
        callback(data);
    }, (error) => {
        console.error(`Error fetching ${collectionName}:`, error);
    });
};

/**
 * Thêm mới dữ liệu
 */
export const addData = async (collectionName: string, data: any) => {
    try {
        const { id, ...cleanData } = data; 
        await addDoc(collection(db, collectionName), cleanData);
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
        const docRef = doc(db, collectionName, id);
        const { id: dataId, ...cleanData } = data; 
        await updateDoc(docRef, cleanData);
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
        await deleteDoc(doc(db, collectionName, id));
    } catch (e) {
        console.error("Error deleting document: ", e);
        throw e;
    }
};

// Export tên collection để dùng ở App
export { COLLECTIONS };
