
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Product, ProductType, Gender, ProductStatus, ProductCalculationType, FormulaType } from '../types';
import { ConfirmModal, CurrencyInput } from '../components/Shared';
import { uploadFile } from '../services/storage'; 
import { calculateProductFee } from '../services/productCalculator';
import { extractPdfText } from '../services/geminiService'; // Import extractor
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
        extractedContent: '', // Init empty
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
    const [isUploadingPdf, setIsUploadingPdf] = useState(false);
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
            calculationType: ProductCalculationType.FIXED, description: '', rulesAndTerms: '', pdfUrl: '', extractedContent: '',
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

    // Updated Handler: Upload -> Storage -> Extract Text -> Save to Form
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploadingPdf(true);
        try {
            // 1. Upload to Firebase Storage
            const url = await uploadFile(file, 'product-docs');
            
            // 2. Call Cloud Function to Extract Text
            // Note: This might take 10-30s for large files
            let extracted = "";
            try {
                const res = await extractPdfText(url);
                extracted = res;
                if (!extracted) {
                    alert("Cảnh báo: Không thể đọc văn bản từ file này. AI sẽ không có dữ liệu chi tiết.");
                }
            } catch (err) {
                console.error("Extraction error", err);
                alert("Lỗi khi đọc file PDF. Vui lòng thử lại sau.");
            }

            setFormData(prev => ({ 
                ...prev, 
                pdfUrl: url,
                extractedContent: extracted,
                rulesAndTerms: prev.rulesAndTerms || `Tài liệu gốc: ${file.name}`
            }));
            
            alert("Đã tải và xử lý tài liệu thành công!");

        } catch (error) {
            alert("Lỗi upload: " + error);
        } finally {
            setIsUploadingPdf(false);
        }
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
        const fee = calculateProductFee({
            product: formData, 
            calculationType: formData.calculationType || ProductCalculationType.FIXED,
            sumAssured: testInputs.sumAssured,
            age: testInputs.age,
            gender: testInputs.gender,
            term: testInputs.term,
            occupationGroup: testInputs.occupationGroup,
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
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-pru-red dark:text-red-400 uppercase tracking-wide">{p.type}</span>
                            {p.extractedContent ? (
                                <span className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded flex items-center font-bold shadow-sm" title="AI đã học nội dung file này">
                                    <i className="fas fa-brain mr-1"></i> Đã học
                                </span>
                            ) : (
                                p.pdfUrl && <span className="text-[10px] bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200"><i className="fas fa-exclamation-triangle"></i> Cần cập nhật</span>
                            )}
                            {p.rateTable && p.rateTable.length > 0 && (
                                <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded flex items-center font-bold shadow-sm" title="Đã có biểu phí động">
                                    <i className="fas fa-calculator mr-1"></i> Có biểu phí
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
                                    
                                    {/* PDF UPLOAD SECTION */}
                                    <div className={`p-4 rounded-lg border transition-colors ${formData.extractedContent ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-900/30' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className={`label-text mb-0 flex items-center font-bold ${formData.extractedContent ? 'text-green-800 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                                <i className={`fas ${formData.extractedContent ? 'fa-brain' : 'fa-file-pdf'} mr-2`}></i> 
                                                {formData.extractedContent ? 'AI đã học nội dung' : 'Tài liệu sản phẩm (PDF)'}
                                            </label>
                                            <label className={`cursor-pointer px-3 py-1.5 rounded text-xs font-bold flex items-center transition shadow-sm ${formData.extractedContent ? 'bg-white text-green-700 border border-green-200 hover:bg-green-50' : 'bg-red-600 text-white hover:bg-red-700'} ${isUploadingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                {isUploadingPdf ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-cloud-upload-alt mr-1"></i>}
                                                {isUploadingPdf ? 'Đang xử lý...' : (formData.extractedContent ? 'Cập nhật PDF mới' : 'Upload PDF')}
                                                <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploadingPdf} />
                                            </label>
                                        </div>
                                        
                                        {formData.extractedContent ? (
                                            <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                                                <i className="fas fa-check-circle mr-1"></i> Hệ thống đã lưu trữ {formData.extractedContent.length.toLocaleString()} ký tự từ tài liệu.
                                                <br/>
                                                <span className="italic text-gray-500">Nếu bạn cập nhật file mới, vui lòng upload lại để AI học lại.</span>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                                Upload file PDF điều khoản để AI có thể trả lời câu hỏi chi tiết về sản phẩm này.
                                                <br/><strong>Lưu ý:</strong> Quá trình xử lý có thể mất 10-30 giây.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB RATES (Giữ nguyên) */}
                            {activeTab === 'rates' && (
                                <div className="space-y-6">
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center"><i className="fas fa-file-excel mr-2"></i> Upload Biểu Phí (Excel)</h4>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">File Excel cần có hàng đầu tiên là tiêu đề cột (VD: Age, Gender, Rate, Occupation...).</p>
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
                                                            <div>
                                                                <label className="label-text text-xs">Cột Nhóm nghề (Occupation)</label>
                                                                <select className="input-field text-xs py-1" value={formData.calculationConfig?.lookupKeys?.occupation || ''} onChange={e => setFormData({...formData, calculationConfig: { ...formData.calculationConfig!, lookupKeys: { ...formData.calculationConfig!.lookupKeys, occupation: e.target.value } }})}>
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
                                                            <input type="number" placeholder="Nhóm nghề (1-4)" className="input-field text-xs py-1" value={testInputs.occupationGroup} onChange={e => setTestInputs({...testInputs, occupationGroup: Number(e.target.value)})} />
                                                        </>
                                                    )}
                                                    
                                                    {formData.calculationConfig?.formulaType === FormulaType.FIXED_FEE && (
                                                        <>
                                                            <select className="input-field text-xs py-1" value={testInputs.htvkPlan} onChange={e => setTestInputs({...testInputs, htvkPlan: e.target.value as HTVKPlan})}>
                                                                {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                            <select className="input-field text-xs py-1" value={testInputs.htvkPackage} onChange={e => setTestInputs({...testInputs, htvkPackage: e.target.value as HTVKPackage})}>
                                                                {Object.values(HTVKPackage).map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                        </>
                                                    )}
                                                </div>
                                                <button onClick={runTestCalculation} className="w-full py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition">Tính thử</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                         </div>

                         {/* Footer */}
                         <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
                             <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                             <button onClick={handleSubmit} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Sản Phẩm</button>
                         </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa sản phẩm?" message={`Bạn có chắc muốn xóa sản phẩm ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} />

            {/* QUICK CALCULATOR MODAL (GLOBAL) */}
            {showCalc && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-sm w-full p-6 shadow-2xl transition-colors">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">
                            <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">Tính Phí Nhanh</h3>
                            <button onClick={() => setShowCalc(false)}><i className="fas fa-times text-gray-400"></i></button>
                        </div>
                        <div className="space-y-3">
                            <select className="input-field" value={inputData.productCode} onChange={e => setInputData({...inputData, productCode: e.target.value})}>
                                <option value="P-DTVT">Đầu Tư Vững Tiến</option>
                                <option value="P-CSBA">Cuộc Sống Bình An</option>
                                <option value="P-TLTS">Tương Lai Tươi Sáng</option>
                            </select>
                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" className="input-field" placeholder="Tuổi" value={inputData.age} onChange={e => setInputData({...inputData, age: Number(e.target.value)})} />
                                <select className="input-field" value={inputData.gender} onChange={e => setInputData({...inputData, gender: e.target.value as Gender})}><option value={Gender.MALE}>Nam</option><option value={Gender.FEMALE}>Nữ</option></select>
                            </div>
                            <CurrencyInput className="input-field font-bold" placeholder="Số tiền bảo hiểm" value={inputData.sumAssured} onChange={v => setInputData({...inputData, sumAssured: v})} />
                            
                            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center border border-green-100 dark:border-green-800">
                                <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase">Phí ước tính</p>
                                <p className="text-2xl font-black text-green-700 dark:text-green-300">{calcResult?.toLocaleString()} đ</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .label-text { display: block; font-size: 0.7rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
            `}</style>
        </div>
    );
};

export default ProductsPage;
