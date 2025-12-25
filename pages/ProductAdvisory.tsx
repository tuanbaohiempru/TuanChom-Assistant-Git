
import React, { useState } from 'react';
import { Customer, Product, Gender, Illustration } from '../types';
import { SearchableCustomerSelect, CurrencyInput, formatDateVN } from '../components/Shared';
import { generateIllustration } from '../services/illustrationService';

interface ProductAdvisoryPageProps {
    customers: Customer[];
    products: Product[];
    onSaveIllustration: (ill: Illustration) => void;
}

const ProductAdvisoryPage: React.FC<ProductAdvisoryPageProps> = ({ customers, products, onSaveIllustration }) => {
    // --- STATE ---
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [manualMode, setManualMode] = useState(false);
    
    // Form Inputs
    const [fullName, setFullName] = useState('');
    const [birthYear, setBirthYear] = useState<number>(1990);
    const [gender, setGender] = useState<Gender>(Gender.MALE);
    const [income, setIncome] = useState<number>(500000000); // 500tr
    const [familyStatus, setFamilyStatus] = useState('Đã kết hôn, 2 con');
    const [concerns, setConcerns] = useState('Bảo vệ toàn diện, quỹ học vấn');

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Illustration | null>(null);

    // --- HANDLERS ---
    const handleCustomerSelect = (c: Customer) => {
        setSelectedCustomer(c);
        setFullName(c.fullName);
        setBirthYear(new Date(c.dob).getFullYear());
        setGender(c.gender);
        // Try to parse income if available or default
        const inc = c.analysis?.incomeEstimate ? parseInt(c.analysis.incomeEstimate.replace(/\D/g, '')) * 1000000 : 0;
        if (inc > 0) setIncome(inc);
        if (c.analysis?.childrenCount !== undefined) {
            setFamilyStatus(`Đã kết hôn, ${c.analysis.childrenCount} con`); // Approximation
        }
        if (c.analysis?.keyConcerns) setConcerns(c.analysis.keyConcerns);
        setManualMode(false);
    };

    const handleGenerate = async () => {
        if (!fullName || !income) return alert("Vui lòng nhập đủ thông tin.");
        setLoading(true);
        const illustration = await generateIllustration({
            fullName, birthYear, gender, incomeYear: income, familyStatus, concerns
        }, products);
        
        if (illustration) {
            // Link back to selected customer ID if available
            if (selectedCustomer) illustration.customerId = selectedCustomer.id;
            setResult(illustration);
        } else {
            alert("AI không thể tạo bảng minh họa lúc này. Vui lòng thử lại.");
        }
        setLoading(false);
    };

    const handleSave = () => {
        if (!result) return;
        if (!result.customerId && !manualMode) return alert("Cần chọn khách hàng để lưu.");
        if (manualMode && !selectedCustomer) return alert("Vui lòng chọn khách hàng có sẵn hoặc tạo mới khách hàng trước khi lưu bảng minh họa.");
        
        // Final check
        const illToSave = { ...result, customerId: selectedCustomer?.id || '' };
        onSaveIllustration(illToSave);
        alert("Đã lưu bảng minh họa thành công!");
        setResult(null); // Reset
    };

    return (
        <div className="space-y-6 pb-20">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                <i className="fas fa-magic text-pru-red mr-3"></i> Tư vấn Sản phẩm (AI)
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LEFT: INPUT FORM */}
                <div className="lg:col-span-1 bg-white dark:bg-pru-card p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 h-fit">
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">Chọn khách hàng</label>
                        <SearchableCustomerSelect 
                            customers={customers} 
                            value={selectedCustomer?.fullName || ''} 
                            onChange={handleCustomerSelect} 
                            placeholder="Tìm khách hàng có sẵn..." 
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <input type="checkbox" id="manual" checked={manualMode} onChange={e => {setManualMode(e.target.checked); setSelectedCustomer(null); setFullName('');}} className="accent-pru-red" />
                            <label htmlFor="manual" className="text-sm text-gray-600 dark:text-gray-300">Hoặc nhập khách hàng mới (Vãng lai)</label>
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                        <div>
                            <label className="label-text">Họ và tên</label>
                            <input className="input-field" value={fullName} onChange={e => setFullName(e.target.value)} disabled={!manualMode && !!selectedCustomer} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label-text">Năm sinh</label>
                                <input type="number" className="input-field" value={birthYear} onChange={e => setBirthYear(Number(e.target.value))} disabled={!manualMode && !!selectedCustomer} />
                            </div>
                            <div>
                                <label className="label-text">Giới tính</label>
                                <select className="input-field" value={gender} onChange={(e:any) => setGender(e.target.value)} disabled={!manualMode && !!selectedCustomer}>
                                    <option value={Gender.MALE}>Nam</option>
                                    <option value={Gender.FEMALE}>Nữ</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="label-text">Thu nhập (Năm)</label>
                            <CurrencyInput className="input-field" value={income} onChange={setIncome} />
                        </div>
                        <div>
                            <label className="label-text">Tình trạng gia đình</label>
                            <input className="input-field" value={familyStatus} onChange={e => setFamilyStatus(e.target.value)} placeholder="VD: Độc thân / Có 2 con..." />
                        </div>
                        <div>
                            <label className="label-text">Nhu cầu / Mối quan tâm</label>
                            <textarea className="input-field" rows={3} value={concerns} onChange={e => setConcerns(e.target.value)} placeholder="VD: Muốn bảo vệ trước ung thư, cần quỹ học vấn..." />
                        </div>

                        <button 
                            onClick={handleGenerate} 
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-pru-red to-red-600 text-white py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition transform active:scale-95 disabled:opacity-70 flex items-center justify-center"
                        >
                            {loading ? <i className="fas fa-circle-notch fa-spin mr-2"></i> : <i className="fas fa-lightbulb mr-2"></i>}
                            {loading ? 'AI Đang phân tích...' : 'Gợi ý giải pháp'}
                        </button>
                    </div>
                </div>

                {/* RIGHT: RESULT */}
                <div className="lg:col-span-2">
                    {result ? (
                        <div className="bg-white dark:bg-pru-card rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden animate-fade-in">
                            {/* Header Result */}
                            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6 relative">
                                <div className="absolute top-4 right-4 opacity-20 text-4xl"><i className="fas fa-shield-alt"></i></div>
                                <h2 className="text-xl font-bold mb-1">Gợi ý Giải pháp Bảo vệ</h2>
                                <p className="text-sm opacity-80">Dành cho: {fullName} • Tổng phí dự kiến: <span className="font-bold text-yellow-400 text-lg">{result.totalFee.toLocaleString()} đ/năm</span></p>
                                <div className="mt-2 text-xs bg-white/10 inline-block px-2 py-1 rounded">
                                    ~ {((result.totalFee / income) * 100).toFixed(1)}% thu nhập
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Reasoning */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                                    <h3 className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-2 flex items-center"><i className="fas fa-comment-dots mr-2"></i> Tại sao chọn gói này?</h3>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed">"{result.reasoning}"</p>
                                </div>

                                {/* Main Product */}
                                <div>
                                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 border-b pb-2">1. Sản phẩm chính (Bảo vệ & Tích lũy)</h3>
                                    <div className="flex justify-between items-center p-4 bg-white dark:bg-gray-800 border-l-4 border-pru-red rounded shadow-sm">
                                        <div>
                                            <div className="font-bold text-lg text-gray-800 dark:text-gray-100">{result.mainProduct.productName}</div>
                                            <div className="text-sm text-gray-500">Người được BH: {result.mainProduct.insuredName}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">Mệnh giá bảo vệ</div>
                                            <div className="font-bold text-xl text-pru-red">{result.mainProduct.sumAssured.toLocaleString()} đ</div>
                                            <div className="text-xs text-gray-500 mt-1">Phí: {result.mainProduct.fee.toLocaleString()} đ</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Riders */}
                                <div>
                                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3 border-b pb-2">2. Sản phẩm bổ trợ (Gia tăng bảo vệ)</h3>
                                    <div className="space-y-3">
                                        {result.riders.map((r, i) => (
                                            <div key={i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-100 dark:border-gray-700">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-xs">{i+1}</div>
                                                    <div>
                                                        <div className="font-bold text-sm text-gray-800 dark:text-gray-200">{r.productName}</div>
                                                        {r.attributes?.plan && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mr-2">{r.attributes.plan}</span>}
                                                        <span className="text-xs text-gray-500">BH: {r.sumAssured.toLocaleString()} đ</span>
                                                    </div>
                                                </div>
                                                <div className="font-bold text-sm text-gray-700 dark:text-gray-300">{r.fee.toLocaleString()} đ</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100 dark:border-gray-800">
                                    <button onClick={() => setResult(null)} className="px-6 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition">Hủy bỏ</button>
                                    {selectedCustomer ? (
                                        <button onClick={handleSave} className="px-6 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md flex items-center">
                                            <i className="fas fa-save mr-2"></i> Lưu vào Hồ sơ Khách hàng
                                        </button>
                                    ) : (
                                        <p className="text-sm text-red-500 flex items-center italic">
                                            <i className="fas fa-exclamation-circle mr-1"></i> Vui lòng chọn Khách hàng ở cột trái để lưu.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 dark:bg-gray-800/20 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12">
                            <i className="fas fa-robot text-6xl mb-4 opacity-50"></i>
                            <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">Chưa có kết quả phân tích</h3>
                            <p className="text-sm max-w-md text-center mt-2">Nhập thông tin bên trái và nhấn "Gợi ý giải pháp" để AI thiết kế gói bảo hiểm tối ưu.</p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.625rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
                .input-field:disabled { background-color: #f3f4f6; cursor: not-allowed; opacity: 0.7; }
                .dark .input-field:disabled { background-color: #374151; }
            `}</style>
        </div>
    );
};

export default ProductAdvisoryPage;
