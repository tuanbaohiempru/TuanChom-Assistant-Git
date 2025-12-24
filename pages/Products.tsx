
import React, { useState, useEffect } from 'react';
import { Product, ProductType, Gender, ProductStatus } from '../types';
import { ConfirmModal, CurrencyInput } from '../components/Shared';
import { extractTextFromPdf } from '../services/geminiService';
import { calculateDauTuVungTien } from '../data/pruDauTuVungTien';
import { calculateHanhTrangVuiKhoe, HTVKPlan, HTVKPackage } from '../data/pruHanhTrangVuiKhoe';

interface ProductsPageProps {
    products: Product[];
    onAdd: (p: Product) => void;
    onUpdate: (p: Product) => void;
    onDelete: (id: string) => void;
}

// Map constants for UI
const PROD_CODE_DAU_TU = 'P-UL-01'; // Matches INITIAL_PRODUCTS code for Dau Tu
const PROD_CODE_HANH_TRANG = 'R-HC-01'; // Matches INITIAL_PRODUCTS code for Hanh Trang

const ProductsPage: React.FC<ProductsPageProps> = ({ products, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Product>({
        id: '', name: '', code: '', type: ProductType.MAIN, status: ProductStatus.ACTIVE, description: '', rulesAndTerms: '', pdfUrl: ''
    });
    const [isExtracting, setIsExtracting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

    // --- CALCULATOR STATE ---
    const [showCalc, setShowCalc] = useState(false);
    const [calcType, setCalcType] = useState<'DauTu' | 'HanhTrang'>('DauTu');
    
    // Dau Tu Inputs
    const [dauTuInput, setDauTuInput] = useState({ age: 30, gender: Gender.MALE, sumAssured: 1000000000 });
    // Hanh Trang Inputs
    const [hanhTrangInput, setHanhTrangInput] = useState({ age: 30, gender: Gender.MALE, plan: HTVKPlan.NANG_CAO, package: HTVKPackage.STANDARD });
    
    const [calcResult, setCalcResult] = useState<number | null>(null);

    const openAdd = () => {
        setFormData({ id: '', name: '', code: '', type: ProductType.MAIN, status: ProductStatus.ACTIVE, description: '', rulesAndTerms: '', pdfUrl: '' });
        setIsEditing(false);
        setShowModal(true);
    };

    const openEdit = (p: Product) => {
        setFormData({ ...p, status: p.status || ProductStatus.ACTIVE });
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

    // Auto calculate when inputs change
    useEffect(() => {
        if (!showCalc) return;

        if (calcType === 'DauTu') {
            const fee = calculateDauTuVungTien(dauTuInput.age, dauTuInput.gender, dauTuInput.sumAssured);
            setCalcResult(fee);
        } else {
            // Hanh Trang Logic
            // Map plan names properly if needed, here we use direct ENUMs
            const fee = calculateHanhTrangVuiKhoe(hanhTrangInput.age, hanhTrangInput.gender, hanhTrangInput.plan, hanhTrangInput.package);
            setCalcResult(fee);
        }
    }, [calcType, dauTuInput, hanhTrangInput, showCalc]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Sản phẩm & Nghiệp vụ</h1>
                <div className="flex gap-2">
                    <button onClick={() => setShowCalc(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-medium flex items-center">
                        <i className="fas fa-calculator mr-2"></i>Tính phí nhanh
                    </button>
                    <button onClick={openAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md font-medium flex items-center">
                        <i className="fas fa-plus mr-2"></i>Thêm sản phẩm
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map(p => (
                    <div key={p.id} className={`bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 flex flex-col hover:shadow-md transition group ${p.status === ProductStatus.INACTIVE ? 'opacity-70 grayscale-[0.5]' : ''}`}>
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight group-hover:text-pru-red transition-colors">{p.name}</h3>
                                <div className="flex gap-2 mt-1">
                                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">{p.code}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                                        p.status === ProductStatus.ACTIVE 
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' 
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                                    }`}>
                                        {p.status || ProductStatus.ACTIVE}
                                    </span>
                                </div>
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

            {/* PRODUCT MODAL */}
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
                            <div>
                                <label className="label-text">Trạng thái kinh doanh</label>
                                <select className="input-field font-medium" value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>
                                    {Object.values(ProductStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
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

            {/* CALCULATOR MODAL */}
            {showCalc && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">
                             <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                <i className="fas fa-calculator text-indigo-500"></i> Tính Phí Nhanh
                             </h3>
                             <button onClick={() => setShowCalc(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="space-y-4">
                            {/* Product Selector */}
                            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                <button 
                                    onClick={() => setCalcType('DauTu')} 
                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition ${calcType === 'DauTu' ? 'bg-white dark:bg-gray-600 shadow text-pru-red dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    Đầu Tư Vững Tiến
                                </button>
                                <button 
                                    onClick={() => setCalcType('HanhTrang')} 
                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition ${calcType === 'HanhTrang' ? 'bg-white dark:bg-gray-600 shadow text-pru-red dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    Hành Trang Vui Khỏe
                                </button>
                            </div>

                            {/* --- FORM DAU TU --- */}
                            {calcType === 'DauTu' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="label-text">Giới tính</label>
                                            <select className="input-field" value={dauTuInput.gender} onChange={(e: any) => setDauTuInput({...dauTuInput, gender: e.target.value})}>
                                                <option value={Gender.MALE}>Nam</option>
                                                <option value={Gender.FEMALE}>Nữ</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label-text">Tuổi tham gia</label>
                                            <input type="number" className="input-field" value={dauTuInput.age} onChange={e => setDauTuInput({...dauTuInput, age: Number(e.target.value)})} min={0} max={70} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label-text">Số tiền bảo hiểm (STBH)</label>
                                        <CurrencyInput className="input-field" value={dauTuInput.sumAssured} onChange={v => setDauTuInput({...dauTuInput, sumAssured: v})} />
                                    </div>
                                </div>
                            )}

                            {/* --- FORM HANH TRANG --- */}
                            {calcType === 'HanhTrang' && (
                                <div className="space-y-4 animate-fade-in">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="label-text">Giới tính</label>
                                            <select className="input-field" value={hanhTrangInput.gender} onChange={(e: any) => setHanhTrangInput({...hanhTrangInput, gender: e.target.value})}>
                                                <option value={Gender.MALE}>Nam</option>
                                                <option value={Gender.FEMALE}>Nữ</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label-text">Tuổi</label>
                                            <input type="number" className="input-field" value={hanhTrangInput.age} onChange={e => setHanhTrangInput({...hanhTrangInput, age: Number(e.target.value)})} min={0} max={70} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label-text">Chương trình</label>
                                        <select className="input-field" value={hanhTrangInput.plan} onChange={(e: any) => setHanhTrangInput({...hanhTrangInput, plan: e.target.value})}>
                                            {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    {(hanhTrangInput.plan === HTVKPlan.TOAN_DIEN || hanhTrangInput.plan === HTVKPlan.HOAN_HAO) && (
                                        <div>
                                            <label className="label-text">Loại thẻ (Mức miễn thường)</label>
                                            <select className="input-field" value={hanhTrangInput.package} onChange={(e: any) => setHanhTrangInput({...hanhTrangInput, package: e.target.value})}>
                                                <option value={HTVKPackage.STANDARD}>Chuẩn (Mặc định)</option>
                                                <option value={HTVKPackage.PLUS_1}>Loại 1 (Có miễn thường)</option>
                                                <option value={HTVKPackage.PLUS_2}>Loại 2 (Không miễn thường)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {calcResult !== null && (
                                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in space-y-2">
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold text-center">Phí Bảo Hiểm (Năm)</p>
                                        <p className="text-2xl font-bold text-pru-red dark:text-red-400 text-center">
                                            {calcResult > 0 ? `${calcResult.toLocaleString()} đ` : 'Chưa có dữ liệu tuổi này'}
                                        </p>
                                    </div>
                                </div>
                            )}
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
