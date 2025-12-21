import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebaseConfig";

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * @param file The file object from the input.
 * @param folder The folder path in storage (default: 'uploads').
 * @returns Promise<string> The download URL.
 */
export const uploadFile = async (file: File, folder: string = 'uploads'): Promise<string> => {
    try {
        // Create a unique filename using timestamp to prevent overwrites
        // Sanitize filename to remove special characters
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${Date.now()}_${cleanFileName}`;
        
        const storageRef = ref(storage, `${folder}/${fileName}`);
        
        // Upload the file
        const snapshot = await uploadBytes(storageRef, file);
        
        // Get the URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return downloadURL;
    } catch (error) {
        console.error("Error uploading file:", error);
        throw new Error("Không thể tải ảnh lên. Vui lòng thử lại.");
    }
};
