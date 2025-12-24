
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
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Sản phẩm & Nghiệp vụ</h1>
                <button onClick={openAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md font-medium flex items-center">
                    <i className="fas fa-plus mr-2"></i>Thêm sản phẩm
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map(p => (
                    <div key={p.id} className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 flex flex-col hover:shadow-md transition group">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight group-hover:text-pru-red transition-colors">{p.name}</h3>
                                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded mt-1 inline-block border border-gray-200 dark:border-gray-700">{p.code}</span>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(p)} className="text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-2 rounded transition"><i className="fas fa-edit"></i></button>
                                <button onClick={() => setDeleteConfirm({ isOpen: true, id: p.id, name: p.name })} className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition"><i className="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div className="text-xs font-bold text-pru-red dark:text-red-400 mb-2 uppercase tracking-wide">{p.type}</div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-4">{p.description}</p>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh] border border-gray-100 dark:border-gray-700 transition-colors">
                         <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">
                             <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{isEditing ? 'Cập nhật Sản phẩm' : 'Thêm Sản phẩm Mới'}</h3>
                             <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                         </div>
                         
                         <div className="space-y-4">
                            <div><label className="label-text">Tên sản phẩm</label><input className="input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="label-text">Mã sản phẩm</label><input className="input-field" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></div>
                                <div><label className="label-text">Loại</label><select className="input-field" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>{Object.values(ProductType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                            </div>
                            <div><label className="label-text">Mô tả ngắn</label><textarea className="input-field" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="label-text">Quy tắc & Điều khoản (Cho AI học)</label>
                                    <label className="cursor-pointer bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded text-xs hover:bg-green-100 dark:hover:bg-green-900/30 flex items-center transition border border-green-200 dark:border-green-800">
                                        <i className="fas fa-file-pdf mr-1"></i>{isExtracting ? 'Đang đọc...' : 'Trích xuất PDF'}
                                        <input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} disabled={isExtracting} />
                                    </label>
                                </div>
                                <textarea className="input-field font-mono text-xs" rows={6} value={formData.rulesAndTerms} onChange={e => setFormData({...formData, rulesAndTerms: e.target.value})} placeholder="Paste nội dung chi tiết điều khoản vào đây..." />
                            </div>
                         </div>
                         
                         <div className="flex justify-end gap-3 mt-6 border-t border-gray-100 dark:border-gray-800 pt-4">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={handleSubmit} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu</button>
                        </div>
                    </div>
                </div>
            )}
            
            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa sản phẩm?" message={`Xóa sản phẩm ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} />

            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.625rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
            `}</style>
        </div>
    );
};

export default ProductsPage;
