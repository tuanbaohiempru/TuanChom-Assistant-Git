import React, { useState } from 'react';
import { Product, ProductType } from '../types';
import { ConfirmModal } from '../components/Shared';
import { extractTextFromPdf } from '../services/geminiService';

interface ProductsPageProps {
    products: Product[];
    onAdd: (p: Product) => void;
    onUpdate: (p: Product) => void;
    onDelete: (id: string) => void;
}

const ProductsPage: React.FC<ProductsPageProps> = ({ products, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Product>({
        id: '', name: '', code: '', type: ProductType.MAIN, description: '', rulesAndTerms: '', pdfUrl: ''
    });
    const [isExtracting, setIsExtracting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

    const openAdd = () => {
        setFormData({ id: '', name: '', code: '', type: ProductType.MAIN, description: '', rulesAndTerms: '', pdfUrl: '' });
        setIsEditing(false);
        setShowModal(true);
    };

    const openEdit = (p: Product) => {
        setFormData(p);
        setIsEditing(true);
        setShowModal(true);
    };

    const handleSubmit = () => {
        if (!formData.name) return alert("Vui lòng nhập tên sản phẩm");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsExtracting(true);
        try { const text = await extractTextFromPdf(file); setFormData(prev => ({ ...prev, rulesAndTerms: text })); } catch (error) { alert("Lỗi: " + error); }
        setIsExtracting(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Sản phẩm & Nghiệp vụ</h1>
                <button onClick={openAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md">
                    <i className="fas fa-plus mr-2"></i>Thêm sản phẩm
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map(p => (
                    <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg leading-tight">{p.name}</h3>
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded mt-1 inline-block">{p.code}</span>
                            </div>
                            <div className="flex">
                                <button onClick={() => openEdit(p)} className="text-blue-500 hover:bg-blue-50 p-2 rounded"><i className="fas fa-edit"></i></button>
                                <button onClick={() => setDeleteConfirm({ isOpen: true, id: p.id, name: p.name })} className="text-red-500 hover:bg-red-50 p-2 rounded"><i className="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div className="text-xs font-bold text-pru-red mb-2 uppercase tracking-wide">{p.type}</div>
                        <p className="text-sm text-gray-600 line-clamp-3 mb-4">{p.description}</p>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                         <h3 className="text-xl font-bold mb-4 border-b pb-2">{isEditing ? 'Cập nhật Sản phẩm' : 'Thêm Sản phẩm Mới'}</h3>
                         <div className="space-y-4">
                            <div><label className="block text-sm font-medium mb-1">Tên sản phẩm</label><input className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium mb-1">Mã sản phẩm</label><input className="w-full border p-2 rounded" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></div>
                                <div><label className="block text-sm font-medium mb-1">Loại</label><select className="w-full border p-2 rounded" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>{Object.values(ProductType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                            </div>
                            <div><label className="block text-sm font-medium mb-1">Mô tả ngắn</label><textarea className="w-full border p-2 rounded" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                            <div>
                                <div className="flex justify-between items-center mb-1"><label className="block text-sm font-medium">Quy tắc & Điều khoản (Cho AI học)</label><label className="cursor-pointer bg-green-50 text-green-700 px-2 py-1 rounded text-xs hover:bg-green-100 flex items-center transition"><i className="fas fa-file-pdf mr-1"></i>{isExtracting ? 'Đang đọc...' : 'Trích xuất PDF'}<input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} disabled={isExtracting} /></label></div>
                                <textarea className="w-full border p-2 rounded font-mono text-xs" rows={6} value={formData.rulesAndTerms} onChange={e => setFormData({...formData, rulesAndTerms: e.target.value})} placeholder="Paste nội dung chi tiết điều khoản vào đây..." />
                            </div>
                         </div>
                         <div className="flex justify-end gap-3 mt-6 border-t pt-4">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={handleSubmit} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu</button>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa sản phẩm?" message={`Xóa sản phẩm ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} />
        </div>
    );
};

export default ProductsPage;