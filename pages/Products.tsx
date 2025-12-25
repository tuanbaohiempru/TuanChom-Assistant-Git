
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Product, ProductType, Gender, ProductStatus, ProductCalculationType, FormulaType } from '../types';
import { ConfirmModal, CurrencyInput } from '../components/Shared';
import { extractTextFromPdf } from '../services/geminiService';
import { calculateProductFee } from '../services/productCalculator';
import { HTVKPlan, HTVKPackage } from '../data/pruHanhTrangVuiKhoe';

interface ProductsPageProps {
    products: Product[];
    onAdd: (p: Product) => void;
    onUpdate: (p: Product) => void;
    onDelete: (id: string) => void;
}

// Helper for friendly names
const getCalculationLabel = (type: string) => {
    switch (type) {
        case ProductCalculationType.RATE_PER_1000_AGE_GENDER: return "Tỷ lệ × (STBH/1000) [Theo Tuổi & Giới tính]";
        case ProductCalculationType.RATE_PER_1000_TERM: return "Tỷ lệ × (STBH/1000) [Theo Thời hạn & Tuổi]";
        case ProductCalculationType.RATE_PER_1000_OCCUPATION: return "Tỷ lệ × (STBH/1000) [Theo Nhóm nghề]";
        case ProductCalculationType.HEALTH_CARE: return "Bảng giá cố định [Theo Tuổi & Gói] (Thẻ SK)";
        case ProductCalculationType.UL_UNIT_LINK: return "Liên kết đơn vị (Unit Link)";
        case ProductCalculationType.WAIVER_CI: return "Tỷ lệ % phí bảo hiểm (Miễn đóng phí)";
        case ProductCalculationType.FIXED: return "Nhập tay thủ công (Không có công thức)";
        default: return type;
    }
};

const ProductsPage: React.FC<ProductsPageProps> = ({ products, onAdd, onUpdate, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'rates'>('info');
    
    const [formData, setFormData] = useState<Product>({
        id: '', name: '', code: '', type: ProductType.MAIN, status: ProductStatus.ACTIVE, 
        calculationType: ProductCalculationType.FIXED, description: '', rulesAndTerms: '', pdfUrl: '',
        rateTable: [],
        calculationConfig: {
            formulaType: FormulaType.RATE_BASED,
            lookupKeys: {},
            resultKey: ''
        }
    });
    
    // Upload State
    const [excelColumns, setExcelColumns] = useState<string[]>([]);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

    // --- TEST CALCULATOR STATE (SANDBOX) ---
    const [testInputs, setTestInputs] = useState({
        age: 30, gender: Gender.MALE, sumAssured: 1000000000, 
        term: 15, occupationGroup: 1,
        htvkPlan: HTVKPlan.NANG_CAO, htvkPackage: HTVKPackage.STANDARD
    });
    const [testResult, setTestResult] = useState<number | null>(null);

    // --- GLOBAL CALCULATOR STATE ---
    const [showCalc, setShowCalc] = useState(false);
    const [calcType, setCalcType] = useState<ProductCalculationType>(ProductCalculationType.RATE_PER_1000_AGE_GENDER);
    // Global inputs (reused same state name 'inputData' but distinct from 'testInputs')
    const [inputData, setInputData] = useState({ 
        age: 30, gender: Gender.MALE, sumAssured: 1000000000, 
        term: 15, occupationGroup: 1,
        htvkPlan: HTVKPlan.NANG_CAO, htvkPackage: HTVKPackage.STANDARD,
        productCode: 'P-DTVT' 
    });
    const [calcResult, setCalcResult] = useState<number | null>(null);

    const openAdd = () => {
        setFormData({ 
            id: '', name: '', code: '', type: ProductType.MAIN, status: ProductStatus.ACTIVE, 
            calculationType: ProductCalculationType.FIXED, description: '', rulesAndTerms: '', pdfUrl: '',
            rateTable: [],
            calculationConfig: { formulaType: FormulaType.RATE_BASED, lookupKeys: {}, resultKey: '' }
        });
        setExcelColumns([]);
        setPreviewData([]);
        setIsEditing(false);
        setActiveTab('info');
        setShowModal(true);
        setTestResult(null);
    };

    const openEdit = (p: Product) => {
        setFormData({ 
            ...p, 
            status: p.status || ProductStatus.ACTIVE,
            calculationConfig: p.calculationConfig || { formulaType: FormulaType.RATE_BASED, lookupKeys: {}, resultKey: '' }
        });
        
        if (p.rateTable && p.rateTable.length > 0) {
            setPreviewData(p.rateTable.slice(0, 5));
            setExcelColumns(Object.keys(p.rateTable[0]));
        } else {
            setPreviewData([]);
            setExcelColumns([]);
        }

        setIsEditing(true);
        setActiveTab('info');
        setShowModal(true);
        setTestResult(null);
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

    const handleRateTableUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            
            if (data && data.length > 0) {
                const cols = Object.keys(data[0] as object);
                setExcelColumns(cols);
                setPreviewData(data.slice(0, 5)); 
                setFormData(prev => ({ ...prev, rateTable: data as Record<string, any>[] }));
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- TEST SANDBOX CALCULATION ---
    const runTestCalculation = () => {
        // Pass the CURRENT formData as the 'product' to simulate the engine
        const fee = calculateProductFee({
            product: formData, // <--- Key magic: Use current editing state
            calculationType: formData.calculationType || ProductCalculationType.FIXED,
            sumAssured: testInputs.sumAssured,
            age: testInputs.age,
            gender: testInputs.gender,
            term: testInputs.term,
            htvkPlan: testInputs.htvkPlan,
            htvkPackage: testInputs.htvkPackage
        });
        setTestResult(fee);
    };

    // Global Calculator Auto Calc
    useEffect(() => {
        if (!showCalc) return;
        const fee = calculateProductFee({
            calculationType: calcType,
            productCode: inputData.productCode,
            sumAssured: inputData.sumAssured,
            age: inputData.age,
            gender: inputData.gender,
            term: inputData.term,
            occupationGroup: inputData.occupationGroup,
            htvkPlan: inputData.htvkPlan,
            htvkPackage: inputData.htvkPackage
        });
        setCalcResult(fee);
    }, [calcType, inputData, showCalc]);

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
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-pru-red dark:text-red-400 uppercase tracking-wide">{p.type}</span>
                            {p.rateTable && p.rateTable.length > 0 && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" title="Đã có biểu phí động">
                                    <i className="fas fa-table"></i>
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-4">{p.description}</p>
                    </div>
                ))}
            </div>

            {/* PRODUCT MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-3xl w-full p-0 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 dark:border-gray-700 transition-colors">
                         {/* Header */}
                         <div className="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                             <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{isEditing ? 'Cập nhật Sản phẩm' : 'Thêm Sản phẩm Mới'}</h3>
                             <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                         </div>

                         {/* Tabs */}
                         <div className="flex border-b border-gray-200 dark:border-gray-700">
                             <button onClick={() => setActiveTab('info')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'info' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Thông tin chung</button>
                             <button onClick={() => setActiveTab('rates')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'rates' ? 'border-pru-red text-pru-red' : 'border-transparent text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Cấu hình Biểu phí</button>
                         </div>
                         
                         <div className="p-6 overflow-y-auto flex-1">
                            {/* TAB INFO */}
                            {activeTab === 'info' && (
                                <div className="space-y-4">
                                    <div><label className="label-text">Tên sản phẩm</label><input className="input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="label-text">Mã sản phẩm</label><input className="input-field" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></div>
                                        <div><label className="label-text">Loại</label><select className="input-field" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>{Object.values(ProductType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    </div>
                                    <div>
                                        <label className="label-text">Loại Tính Phí (Mặc định)</label>
                                        <select className="input-field" value={formData.calculationType} onChange={(e: any) => setFormData({...formData, calculationType: e.target.value})}>
                                            {Object.values(ProductCalculationType).map(t => <option key={t} value={t}>{getCalculationLabel(t)}</option>)}
                                        </select>
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
                            )}

                            {/* TAB RATES */}
                            {activeTab === 'rates' && (
                                <div className="space-y-6">
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center"><i className="fas fa-file-excel mr-2"></i> Upload Biểu Phí (Excel)</h4>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">File Excel cần có hàng đầu tiên là tiêu đề cột (VD: Age, Gender, Rate...).</p>
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleRateTableUpload}
                                            className="block w-full text-sm text-gray-500
                                                file:mr-4 file:py-2 file:px-4
                                                file:rounded-full file:border-0
                                                file:text-sm file:font-semibold
                                                file:bg-blue-100 file:text-blue-700
                                                hover:file:bg-blue-200"
                                        />
                                        {formData.rateTable && formData.rateTable.length > 0 && (
                                            <div className="mt-3 text-xs font-bold text-green-600 dark:text-green-400">
                                                <i className="fas fa-check-circle mr-1"></i> Đã tải lên {formData.rateTable.length} dòng dữ liệu.
                                            </div>
                                        )}
                                    </div>

                                    {excelColumns.length > 0 && (
                                        <div className="space-y-4 animate-fade-in">
                                            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                                                <label className="label-text text-base mb-2">Cấu hình công thức</label>
                                                <select 
                                                    className="input-field font-bold text-pru-red dark:text-red-400 mb-4"
                                                    value={formData.calculationConfig?.formulaType}
                                                    onChange={e => setFormData({
                                                        ...formData, 
                                                        calculationConfig: { ...formData.calculationConfig!, formulaType: e.target.value as FormulaType }
                                                    })}
                                                >
                                                    <option value={FormulaType.RATE_BASED}>Tính theo Tỷ lệ: (STBH / 1000) * Rate</option>
                                                    <option value={FormulaType.FIXED_FEE}>Phí Cố định (Tra bảng lấy giá trị)</option>
                                                </select>

                                                {/* Dynamic Mappers based on Formula Type */}
                                                <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-1">Ánh xạ dữ liệu đầu vào (Input)</div>
                                                    
                                                    {/* Common Inputs */}
                                                    <div>
                                                        <label className="label-text text-xs">Cột Tuổi (Age)</label>
                                                        <select 
                                                            className="input-field text-xs py-1"
                                                            value={formData.calculationConfig?.lookupKeys?.age || ''}
                                                            onChange={e => setFormData({
                                                                ...formData, 
                                                                calculationConfig: { 
                                                                    ...formData.calculationConfig!, 
                                                                    lookupKeys: { ...formData.calculationConfig!.lookupKeys, age: e.target.value } 
                                                                }
                                                            })}
                                                        >
                                                            <option value="">-- Chọn cột --</option>
                                                            {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>

                                                    {/* Formula Specific Inputs */}
                                                    {formData.calculationConfig?.formulaType === FormulaType.RATE_BASED ? (
                                                        <>
                                                            <div>
                                                                <label className="label-text text-xs">Cột Giới tính</label>
                                                                <select className="input-field text-xs py-1" value={formData.calculationConfig?.lookupKeys?.gender || ''} onChange={e => setFormData({...formData, calculationConfig: { ...formData.calculationConfig!, lookupKeys: { ...formData.calculationConfig!.lookupKeys, gender: e.target.value } }})}>
                                                                    <option value="">-- Chọn cột --</option>
                                                                    {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="label-text text-xs">Cột Thời hạn (nếu có)</label>
                                                                <select className="input-field text-xs py-1" value={formData.calculationConfig?.lookupKeys?.term || ''} onChange={e => setFormData({...formData, calculationConfig: { ...formData.calculationConfig!, lookupKeys: { ...formData.calculationConfig!.lookupKeys, term: e.target.value } }})}>
                                                                    <option value="">-- Không dùng --</option>
                                                                    {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div>
                                                                <label className="label-text text-xs">Cột Plan (Chương trình)</label>
                                                                <select className="input-field text-xs py-1" value={formData.calculationConfig?.lookupKeys?.plan || ''} onChange={e => setFormData({...formData, calculationConfig: { ...formData.calculationConfig!, lookupKeys: { ...formData.calculationConfig!.lookupKeys, plan: e.target.value } }})}>
                                                                    <option value="">-- Chọn cột --</option>
                                                                    {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="label-text text-xs">Cột Package (Gói)</label>
                                                                <select className="input-field text-xs py-1" value={formData.calculationConfig?.lookupKeys?.package || ''} onChange={e => setFormData({...formData, calculationConfig: { ...formData.calculationConfig!, lookupKeys: { ...formData.calculationConfig!.lookupKeys, package: e.target.value } }})}>
                                                                    <option value="">-- Chọn cột --</option>
                                                                    {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                                </select>
                                                            </div>
                                                        </>
                                                    )}

                                                    <div className="col-span-2 text-xs font-bold text-gray-500 uppercase border-b pb-1 mb-1 mt-2">Ánh xạ kết quả (Output)</div>
                                                    <div className="col-span-2">
                                                        <label className="label-text text-xs font-bold text-green-600">Cột Giá trị Phí / Tỷ lệ</label>
                                                        <select 
                                                            className="input-field text-xs py-1 border-green-200 bg-green-50"
                                                            value={formData.calculationConfig?.resultKey || ''}
                                                            onChange={e => setFormData({
                                                                ...formData, 
                                                                calculationConfig: { ...formData.calculationConfig!, resultKey: e.target.value } 
                                                            })}
                                                        >
                                                            <option value="">-- Chọn cột kết quả --</option>
                                                            {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* --- TEST SANDBOX --- */}
                                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h4 className="font-bold text-indigo-800 dark:text-indigo-300 text-sm uppercase flex items-center">
                                                        <i className="fas fa-flask mr-2"></i> Kiểm tra thử (Sandbox)
                                                    </h4>
                                                    {testResult !== null && (
                                                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-400 bg-white dark:bg-gray-900 px-3 py-1 rounded shadow-sm">
                                                            {testResult.toLocaleString()} đ
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mb-2">
                                                    <input type="number" placeholder="Tuổi" className="input-field text-xs py-1" value={testInputs.age} onChange={e => setTestInputs({...testInputs, age: Number(e.target.value)})} />
                                                    <select className="input-field text-xs py-1" value={testInputs.gender} onChange={e => setTestInputs({...testInputs, gender: e.target.value as Gender})}><option value={Gender.MALE}>Nam</option><option value={Gender.FEMALE}>Nữ</option></select>
                                                    
                                                    {formData.calculationConfig?.formulaType === FormulaType.RATE_BASED && (
                                                        <>
                                                            <CurrencyInput className="input-field text-xs py-1" placeholder="STBH" value={testInputs.sumAssured} onChange={v => setTestInputs({...testInputs, sumAssured: v})} />
                                                            <input type="number" placeholder="Thời hạn (năm)" className="input-field text-xs py-1" value={testInputs.term} onChange={e => setTestInputs({...testInputs, term: Number(e.target.value)})} />
                                                        </>
                                                    )}
                                                    
                                                    {formData.calculationConfig?.formulaType === FormulaType.FIXED_FEE && (
                                                        <>
                                                            <select className="input-field text-xs py-1" value={testInputs.htvkPlan} onChange={e => setTestInputs({...testInputs, htvkPlan: e.target.value as HTVKPlan})}>
                                                                {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                            <input type="text" placeholder="Package (Gói)" className="input-field text-xs py-1" value={testInputs.htvkPackage} onChange={e => setTestInputs({...testInputs, htvkPackage: e.target.value as any})} />
                                                        </>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={runTestCalculation}
                                                    disabled={!formData.calculationConfig?.resultKey}
                                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 rounded-lg disabled:opacity-50"
                                                >
                                                    Tính thử ngay
                                                </button>
                                            </div>

                                            {/* Preview Data Table */}
                                            <div>
                                                <label className="label-text mb-2">Xem trước dữ liệu (5 dòng đầu)</label>
                                                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                                    <table className="min-w-full text-xs text-left">
                                                        <thead className="bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-300">
                                                            <tr>
                                                                {excelColumns.map(c => <th key={c} className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">{c}</th>)}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                                            {previewData.map((row, idx) => (
                                                                <tr key={idx}>
                                                                    {excelColumns.map(c => <td key={`${idx}-${c}`} className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{row[c]}</td>)}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                         </div>
                         
                         <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                            <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                            <button onClick={handleSubmit} className="px-5 py-2 bg-pru-red text-white rounded-lg font-bold hover:bg-red-700 shadow-md">Lưu Sản Phẩm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* GLOBAL CALCULATOR MODAL (Unchanged Logic, just rendering) */}
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
                            <select className="input-field font-bold text-pru-red dark:text-red-400" value={calcType} onChange={(e) => setCalcType(e.target.value as ProductCalculationType)}>
                                <option value={ProductCalculationType.RATE_PER_1000_AGE_GENDER}>Bảo vệ & Đầu tư (Theo tuổi)</option>
                                <option value={ProductCalculationType.RATE_PER_1000_TERM}>Tích lũy & Bệnh Lý (Theo thời hạn)</option>
                                <option value={ProductCalculationType.RATE_PER_1000_OCCUPATION}>Tai Nạn (Theo nhóm nghề)</option>
                                <option value={ProductCalculationType.HEALTH_CARE}>Hành Trang Vui Khỏe</option>
                            </select>

                            {calcType === ProductCalculationType.RATE_PER_1000_AGE_GENDER && (
                                <div>
                                    <label className="label-text">Dòng sản phẩm</label>
                                    <select className="input-field" value={inputData.productCode} onChange={(e) => setInputData({...inputData, productCode: e.target.value})}>
                                        <option value="P-DTVT">Đầu Tư Vững Tiến / Linh Hoạt / BV Tối Đa</option>
                                        <option value="P-CSBA">Cuộc Sống Bình An (Truyền thống)</option>
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                {calcType !== ProductCalculationType.RATE_PER_1000_OCCUPATION && (
                                    <>
                                        <div><label className="label-text">Giới tính</label><select className="input-field" value={inputData.gender} onChange={(e: any) => setInputData({...inputData, gender: e.target.value})}><option value={Gender.MALE}>Nam</option><option value={Gender.FEMALE}>Nữ</option></select></div>
                                        <div><label className="label-text">Tuổi</label><input type="number" className="input-field" value={inputData.age} onChange={e => setInputData({...inputData, age: Number(e.target.value)})} min={0} max={70} /></div>
                                    </>
                                )}
                            </div>

                            {calcType !== ProductCalculationType.HEALTH_CARE && (
                                <div><label className="label-text">Số tiền bảo hiểm (STBH)</label><CurrencyInput className="input-field" value={inputData.sumAssured} onChange={v => setInputData({...inputData, sumAssured: v})} /></div>
                            )}

                            {calcType === ProductCalculationType.RATE_PER_1000_TERM && (
                                <div><label className="label-text">Thời hạn đóng phí (Năm)</label><select className="input-field" value={inputData.term} onChange={(e) => setInputData({...inputData, term: Number(e.target.value)})}>{Array.from({length: 25}, (_, i) => i + 5).map(y => <option key={y} value={y}>{y} năm</option>)}</select></div>
                            )}

                            {calcType === ProductCalculationType.RATE_PER_1000_OCCUPATION && (
                                <div><label className="label-text">Nhóm nghề</label><select className="input-field" value={inputData.occupationGroup} onChange={(e) => setInputData({...inputData, occupationGroup: Number(e.target.value)})}>
                                        <option value="1">Nhóm 1 (Hành chính)</option><option value="2">Nhóm 2 (Nhẹ)</option><option value="3">Nhóm 3 (Nặng)</option><option value="4">Nhóm 4 (Nguy hiểm)</option>
                                    </select>
                                </div>
                            )}

                            {calcType === ProductCalculationType.HEALTH_CARE && (
                                <div className="space-y-4">
                                    <div><label className="label-text">Chương trình</label><select className="input-field" value={inputData.htvkPlan} onChange={(e: any) => setInputData({...inputData, htvkPlan: e.target.value})}>{Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    {(inputData.htvkPlan === HTVKPlan.TOAN_DIEN || inputData.htvkPlan === HTVKPlan.HOAN_HAO) && (
                                        <div><label className="label-text">Loại thẻ</label><select className="input-field" value={inputData.htvkPackage} onChange={(e: any) => setInputData({...inputData, htvkPackage: e.target.value})}><option value={HTVKPackage.STANDARD}>Chuẩn</option><option value={HTVKPackage.PLUS_1}>Loại 1</option><option value={HTVKPackage.PLUS_2}>Loại 2</option></select></div>
                                    )}
                                </div>
                            )}

                            {calcResult !== null && (
                                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in space-y-2">
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold text-center">Phí Bảo Hiểm (Năm)</p>
                                        <p className="text-2xl font-bold text-pru-red dark:text-red-400 text-center">
                                            {calcResult > 0 ? `${calcResult.toLocaleString()} đ` : 'Không có dữ liệu'}
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
