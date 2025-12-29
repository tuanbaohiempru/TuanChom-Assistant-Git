
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Customer, Product, Gender, Illustration, ProductType, ProductCalculationType, ProductStatus } from '../types';
import { SearchableCustomerSelect, CurrencyInput, formatDateVN } from '../components/Shared';
import { calculateProductFee } from '../services/productCalculator';
import { HTVKPlan, HTVKPackage } from '../data/pruHanhTrangVuiKhoe';

interface ProductAdvisoryPageProps {
    customers: Customer[];
    products: Product[];
    onSaveIllustration: (ill: Illustration) => void;
}

const ProductAdvisoryPage: React.FC<ProductAdvisoryPageProps> = ({ customers, products, onSaveIllustration }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { customerId, suggestedSA, goal } = location.state || {};

    // --- MAIN STATE ---
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [manualMode, setManualMode] = useState(false);
    
    // Customer Details (For manual mode or derived from selectedCustomer)
    const [fullName, setFullName] = useState('');
    const [birthYear, setBirthYear] = useState<number>(1990);
    const [gender, setGender] = useState<Gender>(Gender.MALE);

    // --- ILLUSTRATION CONFIGURATION STATE ---
    const [mainProduct, setMainProduct] = useState<{
        id: string;
        name: string;
        code: string;
        sumAssured: number;
        fee: number;
        paymentTerm: number;
    }>({ id: '', name: '', code: '', sumAssured: suggestedSA || 1000000000, fee: 0, paymentTerm: 15 });

    const [riders, setRiders] = useState<{
        id: string; // temp id for list key
        productId: string;
        productName: string;
        code: string;
        sumAssured: number;
        fee: number;
        insuredName: string; // rider can cover family
        attributes: any; // plan, package, occupation, etc.
    }[]>([]);

    // --- FILTERED PRODUCT LISTS ---
    const mainProductsList = products.filter(p => p.type === ProductType.MAIN && p.status === ProductStatus.ACTIVE);
    const riderProductsList = products.filter(p => p.type === ProductType.RIDER && p.status === ProductStatus.ACTIVE);

    // --- INITIALIZATION ---
    useEffect(() => {
        if (customerId) {
            const c = customers.find(cus => cus.id === customerId);
            if (c) handleCustomerSelect(c);
        }
    }, [customerId, customers]);

    // Update derived state when selection changes
    const handleCustomerSelect = (c: Customer) => {
        setSelectedCustomer(c);
        setFullName(c.fullName);
        setBirthYear(new Date(c.dob).getFullYear());
        setGender(c.gender);
        setManualMode(false);
    };

    // --- FEE CALCULATION LOGIC ---
    
    const calculateMainFee = () => {
        if (!mainProduct.id) return 0;
        const productDef = products.find(p => p.id === mainProduct.id);
        if (!productDef) return 0;

        const age = new Date().getFullYear() - birthYear;
        
        return calculateProductFee({
            product: productDef,
            calculationType: productDef.calculationType || ProductCalculationType.FIXED,
            productCode: productDef.code,
            sumAssured: mainProduct.sumAssured,
            age: age < 0 ? 0 : age,
            gender: gender,
            term: mainProduct.paymentTerm,
            occupationGroup: 1 // Main product usually 1
        });
    };

    // Effect to update Main Fee when inputs change
    useEffect(() => {
        const fee = calculateMainFee();
        if (fee !== mainProduct.fee) {
            setMainProduct(prev => ({ ...prev, fee }));
        }
    }, [mainProduct.id, mainProduct.sumAssured, mainProduct.paymentTerm, birthYear, gender]);

    // --- UNIFIED RIDER UPDATE HANDLER (Fixes Race Condition) ---
    const updateRider = (idx: number, updates: Partial<typeof riders[0]>) => {
        const newRiders = [...riders];
        // Merge updates into current rider state
        const updatedRider = { ...newRiders[idx], ...updates };
        
        // Recalculate Fee based on the NEW merged state
        const riderProd = products.find(p => p.id === updatedRider.productId);
        if (riderProd) {
            // Find insured person (Default to Main Customer if name matches, otherwise try to find in DB or estimate)
            const insuredCus = customers.find(c => c.fullName === updatedRider.insuredName);
            // If manual name, rely on main customer age as fallback
            const rAge = insuredCus ? new Date().getFullYear() - new Date(insuredCus.dob).getFullYear() : (new Date().getFullYear() - birthYear);
            const rGender = insuredCus ? insuredCus.gender : gender;

            const fee = calculateProductFee({
                product: riderProd,
                calculationType: riderProd.calculationType || ProductCalculationType.FIXED,
                productCode: riderProd.code,
                sumAssured: updatedRider.sumAssured,
                age: rAge < 0 ? 0 : rAge,
                gender: rGender,
                term: updatedRider.attributes?.paymentTerm || 10,
                occupationGroup: updatedRider.attributes?.occupationGroup || 1,
                htvkPlan: updatedRider.attributes?.plan,
                htvkPackage: updatedRider.attributes?.package
            });
            updatedRider.fee = fee;
        } else {
            updatedRider.fee = 0;
        }

        newRiders[idx] = updatedRider;
        setRiders(newRiders);
    };

    const addRider = () => {
        setRiders([...riders, {
            id: Date.now().toString(),
            productId: '',
            productName: '',
            code: '',
            sumAssured: 0,
            fee: 0,
            insuredName: fullName, // Default to main insured
            attributes: {}
        }]);
    };

    const removeRider = (idx: number) => {
        const newRiders = [...riders];
        newRiders.splice(idx, 1);
        setRiders(newRiders);
    };

    // --- TOTALS ---
    const totalFee = mainProduct.fee + riders.reduce((sum, r) => sum + r.fee, 0);

    // --- SAVE HANDLER ---
    const handleSave = () => {
        if (!mainProduct.id) return alert("Vui lòng chọn sản phẩm chính");
        if (!selectedCustomer && !manualMode) return alert("Vui lòng chọn khách hàng");

        const illustration: Illustration = {
            id: Date.now().toString(),
            customerId: selectedCustomer?.id || '',
            customerName: fullName,
            createdAt: new Date().toISOString(),
            mainProduct: {
                productId: mainProduct.id,
                productName: mainProduct.name,
                insuredName: fullName,
                sumAssured: mainProduct.sumAssured,
                fee: mainProduct.fee,
                attributes: { paymentTerm: mainProduct.paymentTerm }
            },
            riders: riders.map(r => ({
                productId: r.productId,
                productName: r.productName,
                insuredName: r.insuredName,
                sumAssured: r.sumAssured,
                fee: r.fee,
                attributes: r.attributes
            })),
            totalFee: totalFee,
            reasoning: `Thiết kế thủ công cho mục tiêu: ${goal || 'Bảo vệ'}`,
            status: 'DRAFT'
        };

        onSaveIllustration(illustration);
        alert("Đã lưu bảng minh họa thành công!");
        navigate('/customers'); // Or stay?
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                    <i className="fas fa-drafting-compass text-pru-red mr-3"></i> Thiết kế Giải pháp (Minh họa)
                </h1>
                {goal && (
                    <div className="text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">
                        Mục tiêu: <span className="text-pru-red font-bold">{goal}</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                
                {/* LEFT COLUMN: CONFIGURATOR */}
                <div className="lg:col-span-5 space-y-6 h-full overflow-y-auto pr-2">
                    
                    {/* 1. CUSTOMER INFO */}
                    <div className="bg-white dark:bg-pru-card p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-3">1. Thông tin khách hàng</h3>
                        <div className="space-y-3">
                            <SearchableCustomerSelect 
                                customers={customers} 
                                value={selectedCustomer?.fullName || ''} 
                                onChange={handleCustomerSelect} 
                                placeholder="Tìm khách hàng..." 
                            />
                            {!selectedCustomer && (
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" id="manual" checked={manualMode} onChange={e => {setManualMode(e.target.checked); setSelectedCustomer(null); setFullName('');}} className="accent-pru-red" />
                                    <label htmlFor="manual" className="text-xs text-gray-600 dark:text-gray-300">Nhập tay (Khách vãng lai)</label>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="label-text">Họ tên</label><input className="input-field" value={fullName} onChange={e => setFullName(e.target.value)} disabled={!manualMode} /></div>
                                <div>
                                    <label className="label-text">Năm sinh / Tuổi</label>
                                    <div className="flex gap-2">
                                        <input type="number" className="input-field w-20" value={birthYear} onChange={e => setBirthYear(Number(e.target.value))} disabled={!manualMode} />
                                        <span className="flex items-center text-sm text-gray-500">{new Date().getFullYear() - birthYear}t</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="label-text">Giới tính</label>
                                    <select className="input-field" value={gender} onChange={(e: any) => setGender(e.target.value)} disabled={!manualMode}>
                                        <option value={Gender.MALE}>Nam</option><option value={Gender.FEMALE}>Nữ</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. MAIN PRODUCT */}
                    <div className="bg-white dark:bg-pru-card p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <h3 className="text-sm font-bold text-blue-600 uppercase mb-3 ml-2">2. Sản phẩm chính</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="label-text">Chọn sản phẩm</label>
                                <select 
                                    className="input-field font-bold text-gray-800 dark:text-gray-100"
                                    value={mainProduct.id}
                                    onChange={(e) => {
                                        const p = mainProductsList.find(pr => pr.id === e.target.value);
                                        if (p) setMainProduct({...mainProduct, id: p.id, name: p.name, code: p.code});
                                    }}
                                >
                                    <option value="">-- Chọn sản phẩm chính --</option>
                                    {mainProductsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label-text">Số tiền bảo hiểm</label>
                                    <CurrencyInput className="input-field font-bold" value={mainProduct.sumAssured} onChange={v => setMainProduct({...mainProduct, sumAssured: v})} />
                                </div>
                                <div>
                                    <label className="label-text">Thời hạn đóng phí</label>
                                    <select className="input-field" value={mainProduct.paymentTerm} onChange={e => setMainProduct({...mainProduct, paymentTerm: Number(e.target.value)})}>
                                        {Array.from({length: 20}, (_, i) => i + 10).map(y => <option key={y} value={y}>{y} năm</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex justify-between items-center border border-blue-100 dark:border-blue-800">
                                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">Phí chính dự kiến</span>
                                <span className="text-lg font-bold text-blue-700 dark:text-blue-300">{mainProduct.fee.toLocaleString()} đ</span>
                            </div>
                        </div>
                    </div>

                    {/* 3. RIDERS */}
                    <div className="bg-white dark:bg-pru-card p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                        <div className="flex justify-between items-center mb-3 ml-2">
                            <h3 className="text-sm font-bold text-orange-600 uppercase">3. Sản phẩm bổ trợ</h3>
                            <button onClick={addRider} className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-1 rounded hover:bg-orange-200 transition font-bold">+ Thêm</button>
                        </div>
                        
                        <div className="space-y-3">
                            {riders.map((rider, idx) => {
                                const prodDef = products.find(p => p.id === rider.productId);
                                const isHealth = prodDef?.calculationType === ProductCalculationType.HEALTH_CARE;
                                const isAccident = prodDef?.calculationType === ProductCalculationType.RATE_PER_1000_OCCUPATION;

                                return (
                                    <div key={rider.id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 relative group">
                                        <button onClick={() => removeRider(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i className="fas fa-times-circle"></i></button>
                                        
                                        <div className="grid grid-cols-1 gap-2">
                                            <select 
                                                className="input-field text-xs py-1.5"
                                                value={rider.productId}
                                                onChange={(e) => {
                                                    const pId = e.target.value;
                                                    const p = riderProductsList.find(pr => pr.id === pId);
                                                    
                                                    // Set default attributes if switching to Health Care
                                                    let attributes = { ...rider.attributes };
                                                    if (p?.calculationType === ProductCalculationType.HEALTH_CARE) {
                                                        attributes = { plan: HTVKPlan.NANG_CAO, package: HTVKPackage.STANDARD };
                                                    }

                                                    updateRider(idx, {
                                                        productId: pId,
                                                        productName: p?.name || '',
                                                        code: p?.code || '',
                                                        attributes: attributes
                                                    });
                                                }}
                                            >
                                                <option value="">-- Chọn Rider --</option>
                                                {riderProductsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>

                                            <div className="grid grid-cols-2 gap-2">
                                                <SearchableCustomerSelect 
                                                    customers={customers} 
                                                    value={rider.insuredName} 
                                                    onChange={c => updateRider(idx, { insuredName: c.fullName })} 
                                                    className="text-xs"
                                                    placeholder="NĐBH"
                                                />
                                                
                                                {isHealth ? (
                                                    <select 
                                                        className="input-field text-xs py-1.5"
                                                        value={rider.attributes?.plan || HTVKPlan.NANG_CAO}
                                                        onChange={(e) => updateRider(idx, { attributes: { ...rider.attributes, plan: e.target.value } })}
                                                    >
                                                        {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                ) : (
                                                    <CurrencyInput 
                                                        className="input-field text-xs py-1.5" 
                                                        placeholder="STBH" 
                                                        value={rider.sumAssured} 
                                                        onChange={v => updateRider(idx, { sumAssured: v })} 
                                                    />
                                                )}
                                            </div>
                                            <div className="flex justify-end text-xs font-bold text-gray-600 dark:text-gray-400">
                                                Phí: {rider.fee.toLocaleString()} đ
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {riders.length === 0 && <p className="text-xs text-gray-400 italic text-center py-2">Chưa có sản phẩm bổ trợ.</p>}
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: SUMMARY TABLE */}
                <div className="lg:col-span-7 flex flex-col gap-6 h-full overflow-y-auto">
                    
                    {/* FEE SUMMARY CARD (TOTAL) */}
                    <div className="bg-white dark:bg-pru-card p-6 rounded-xl shadow-lg border-t-4 border-pru-red flex justify-between items-center">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm uppercase font-bold">Tổng phí đóng (Năm)</p>
                            <p className="text-3xl font-black text-pru-red">{totalFee.toLocaleString()} <span className="text-sm font-normal text-gray-500">VNĐ</span></p>
                        </div>
                        <button onClick={handleSave} className="bg-pru-red hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center transition transform active:scale-95">
                            <i className="fas fa-save mr-2"></i> Lưu Bảng Minh Họa
                        </button>
                    </div>

                    {/* FEE BREAKDOWN TABLE (Replaces Projection Chart) */}
                    <div className="bg-white dark:bg-pru-card p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex-1">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center">
                                <i className="fas fa-file-invoice-dollar text-indigo-500 mr-2"></i> Chi tiết Quyền lợi & Phí
                            </h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold border-b border-gray-100 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-3">Sản phẩm</th>
                                        <th className="px-4 py-3">Người được BH</th>
                                        <th className="px-4 py-3 text-right">STBH / Gói</th>
                                        <th className="px-4 py-3 text-right">Phí (VNĐ)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {/* Main Product Row */}
                                    {mainProduct.id && (
                                        <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                                            <td className="px-4 py-3 font-bold text-blue-800 dark:text-blue-300">
                                                {mainProduct.name}
                                                <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">CHÍNH</span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{mainProduct.id ? fullName : '-'}</td>
                                            <td className="px-4 py-3 text-right font-medium">{mainProduct.sumAssured.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-blue-700 dark:text-blue-400">{mainProduct.fee.toLocaleString()}</td>
                                        </tr>
                                    )}

                                    {/* Rider Rows */}
                                    {riders.map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300 pl-8 relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">└</span>
                                                {r.productName || 'Chưa chọn sản phẩm'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.insuredName}</td>
                                            <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                                                {r.attributes?.plan ? r.attributes.plan : r.sumAssured.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">{r.fee.toLocaleString()}</td>
                                        </tr>
                                    ))}

                                    {/* Total Row */}
                                    <tr className="bg-gray-100 dark:bg-gray-700 font-bold border-t-2 border-gray-200 dark:border-gray-600">
                                        <td className="px-4 py-3 text-gray-800 dark:text-gray-100" colSpan={3}>TỔNG CỘNG</td>
                                        <td className="px-4 py-3 text-right text-pru-red dark:text-red-400 text-lg">{totalFee.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-900/30 text-xs text-yellow-800 dark:text-yellow-400">
                            <i className="fas fa-info-circle mr-1"></i> <strong>Lưu ý:</strong> Đây là bảng tính phí ước tính (Quote) dựa trên thông tin nhập liệu. Vui lòng tham khảo Epos để có bảng minh họa chi tiết và chính xác nhất trước khi nộp hồ sơ.
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .label-text { display: block; font-size: 0.7rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; }
                .dark .input-field { background-color: #1f2937; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
            `}</style>
        </div>
    );
};

export default ProductAdvisoryPage;
