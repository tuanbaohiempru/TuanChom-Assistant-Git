import React, { useState, useRef } from 'react';
import { ImportResult } from '../utils/excelHelpers';

interface ExcelImportModalProps<T> {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    onDownloadTemplate: () => void;
    onProcessFile: (file: File) => Promise<ImportResult<T>>;
    onSave: (validData: T[]) => Promise<void>;
}

const ExcelImportModal = <T extends any>({ isOpen, onClose, title, onDownloadTemplate, onProcessFile, onSave }: ExcelImportModalProps<T>) => {
    const [step, setStep] = useState<'upload' | 'preview' | 'saving'>('upload');
    const [result, setResult] = useState<ImportResult<T> | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const res = await onProcessFile(file);
            setResult(res);
            setStep('preview');
        } catch (error) {
            alert("Lỗi đọc file: " + error);
        } finally {
            setIsProcessing(false);
            e.target.value = ''; // Reset
        }
    };

    const handleSave = async () => {
        if (!result || result.valid.length === 0) return;
        setStep('saving');
        try {
            await onSave(result.valid);
            alert(`Đã nhập thành công ${result.valid.length} dòng dữ liệu!`);
            onClose();
            // Reset
            setStep('upload');
            setResult(null);
        } catch (error) {
            alert("Lỗi khi lưu dữ liệu: " + error);
            setStep('preview');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4 animate-fade-in">
            <div className="bg-white rounded-xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <i className="fas fa-file-excel text-green-600"></i> {title}
                        </h3>
                        <p className="text-sm text-gray-500">Nhập dữ liệu hàng loạt từ Excel</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xl"></i></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'upload' && (
                        <div className="h-full flex flex-col items-center justify-center space-y-6">
                            <div className="text-center space-y-2">
                                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto border-2 border-green-100">
                                    <i className="fas fa-cloud-upload-alt text-4xl text-green-500"></i>
                                </div>
                                <h4 className="font-bold text-gray-800 text-lg">Tải lên file Excel</h4>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto">Chỉ hỗ trợ file .xlsx. Vui lòng tải file mẫu trước để đảm bảo đúng định dạng.</p>
                            </div>

                            <button 
                                onClick={onDownloadTemplate}
                                className="text-blue-600 hover:underline text-sm font-medium flex items-center"
                            >
                                <i className="fas fa-download mr-1"></i> Tải file mẫu chuẩn
                            </button>

                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                            />
                            
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                                className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 transition shadow-lg shadow-green-500/30 flex items-center"
                            >
                                {isProcessing ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-folder-open mr-2"></i>}
                                {isProcessing ? 'Đang xử lý...' : 'Chọn file từ máy'}
                            </button>
                        </div>
                    )}

                    {step === 'preview' && result && (
                        <div className="space-y-4">
                            <div className="flex gap-4 mb-4">
                                <div className="flex-1 bg-green-50 border border-green-200 p-3 rounded-lg flex items-center gap-3">
                                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">{result.valid.length}</div>
                                    <div>
                                        <div className="font-bold text-green-800">Hợp lệ</div>
                                        <div className="text-xs text-green-600">Sẵn sàng nhập</div>
                                    </div>
                                </div>
                                <div className="flex-1 bg-red-50 border border-red-200 p-3 rounded-lg flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">{result.invalid.length}</div>
                                    <div>
                                        <div className="font-bold text-red-800">Lỗi / Trùng lặp</div>
                                        <div className="text-xs text-red-600">Sẽ bị bỏ qua</div>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-100 px-4 py-2 font-bold text-xs uppercase text-gray-500">Xem trước kết quả (50 dòng đầu)</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white border-b">
                                            <tr>
                                                <th className="px-4 py-2">Trạng thái</th>
                                                <th className="px-4 py-2">Thông tin chính</th>
                                                <th className="px-4 py-2">Lỗi (nếu có)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {/* Invalid First */}
                                            {result.invalid.map((item, i) => (
                                                <tr key={`inv-${i}`} className="bg-red-50/50">
                                                    <td className="px-4 py-2 text-red-600 font-bold text-xs"><i className="fas fa-times-circle mr-1"></i> Bỏ qua</td>
                                                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{item.data.slice(0, 3).join(' | ')}</td>
                                                    <td className="px-4 py-2 text-red-600 italic text-xs">{item.error}</td>
                                                </tr>
                                            ))}
                                            {/* Valid Next */}
                                            {result.valid.slice(0, 50).map((item: any, i) => (
                                                <tr key={`val-${i}`} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2 text-green-600 font-bold text-xs"><i className="fas fa-check-circle mr-1"></i> Hợp lệ</td>
                                                    <td className="px-4 py-2">
                                                        <div className="font-bold">{item.fullName || item.contractNumber}</div>
                                                        <div className="text-xs text-gray-500">{item.phone || item.totalFee}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-400 text-xs">-</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'saving' && (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i>
                            <h4 className="font-bold text-gray-800">Đang lưu dữ liệu...</h4>
                            <p className="text-gray-500 text-sm">Vui lòng không tắt trình duyệt.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'preview' && (
                    <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                        <button onClick={() => { setStep('upload'); setResult(null); }} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Chọn file khác</button>
                        <button 
                            onClick={handleSave}
                            disabled={!result || result.valid.length === 0}
                            className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md disabled:opacity-50 disabled:shadow-none"
                        >
                            Nhập {result?.valid.length} dòng
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExcelImportModal;
