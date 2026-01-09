
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, auth } from "./firebaseConfig";

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * @param file The file object from the input.
 * @param folder The folder path in storage (default: 'uploads').
 * @returns Promise<string> The download URL.
 */
export const uploadFile = async (file: File, folder: string = 'uploads'): Promise<string> => {
    try {
        // Debug: Kiểm tra xem user có đang đăng nhập không
        if (!auth.currentUser) {
            throw new Error("Người dùng chưa đăng nhập. Vui lòng đăng nhập lại.");
        }

        // Create a unique filename using timestamp to prevent overwrites
        // Sanitize filename to remove special characters
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${Date.now()}_${cleanFileName}`;
        
        const storageRef = ref(storage, `${folder}/${fileName}`);
        
        const metadata = {
            contentType: file.type,
            customMetadata: {
                'uploadedBy': auth.currentUser.uid,
                'uploadedAt': new Date().toISOString()
            }
        };

        // Upload the file
        const snapshot = await uploadBytes(storageRef, file, metadata);
        
        // Get the URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return downloadURL;
    } catch (error: any) {
        console.error("Error uploading file:", error);
        
        // Xử lý thông báo lỗi thân thiện hơn
        if (error.code === 'storage/unauthorized') {
            throw new Error("Lỗi quyền truy cập (Unauthorized). Vui lòng kiểm tra tab 'Rules' trong Firebase Storage Console và đảm bảo allow read, write: if request.auth != null;");
        } else if (error.code === 'storage/canceled') {
            throw new Error("Đã hủy tải lên.");
        } else if (error.code === 'storage/unknown') {
            throw new Error("Lỗi không xác định, vui lòng thử lại.");
        }

        throw new Error(error.message || "Không thể tải file lên.");
    }
};
