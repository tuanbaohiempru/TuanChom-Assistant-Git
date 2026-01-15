
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

    // Mobile UI State
    const [activeTab, setActiveTab] = useState<'design' | 'summary'>('design');

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
        attributes: any; // plan, package, occupation, term, etc.
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
    const updateRider = (idx: number, updates: Partial<typeof riders[0]> | { attributes: any }) => {
        const newRiders = [...riders];
        
        // Deep merge attributes if present
        let currentRider = { ...newRiders[idx] };
        if ('attributes' in updates) {
            currentRider.attributes = { ...currentRider.attributes, ...updates.attributes };
            const { attributes, ...rest } = updates as any;
            currentRider = { ...currentRider, ...rest };
        } else {
            currentRider = { ...currentRider, ...updates };
        }
        
        // Recalculate Fee based on the NEW merged state
        const riderProd = products.find(p => p.id === currentRider.productId);
        if (riderProd) {
            // Find insured person (Default to Main Customer if name matches, otherwise try to find in DB or estimate)
            const insuredCus = customers.find(c => c.fullName === currentRider.insuredName);
            // If manual name, rely on main customer age as fallback
            const rAge = insuredCus ? new Date().getFullYear() - new Date(insuredCus.dob).getFullYear() : (new Date().getFullYear() - birthYear);
            const rGender = insuredCus ? insuredCus.gender : gender;

            const fee = calculateProductFee({
                product: riderProd,
                calculationType: riderProd.calculationType || ProductCalculationType.FIXED,
                productCode: riderProd.code,
                sumAssured: currentRider.sumAssured,
                age: rAge < 0 ? 0 : rAge,
                gender: rGender,
                term: Number(currentRider.attributes?.paymentTerm) || 10,
                occupationGroup: Number(currentRider.attributes?.occupationGroup) || 1,
                htvkPlan: currentRider.attributes?.plan,
                htvkPackage: currentRider.attributes?.package
            });
            currentRider.fee = fee;
        } else {
            currentRider.fee = 0;
        }

        newRiders[idx] = currentRider;
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
            attributes: {
                occupationGroup: 1, // Default
                paymentTerm: 10 // Default
            }
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
        navigate('/customers'); 
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-50 dark:bg-black">
            {/* 1. HEADER */}
            <div className="flex-shrink-0 bg-white dark:bg-pru-card p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shadow-sm z-20">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
                        <i className="fas fa-drafting-compass text-pru-red mr-2"></i> Thiết kế Giải pháp
                    </h1>
                    {goal && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mục tiêu: {goal}</p>}
                </div>
                {/* Mobile Tabs Switcher */}
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 lg:hidden">
                    <button 
                        onClick={() => setActiveTab('design')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'design' ? 'bg-white dark:bg-pru-card text-pru-red shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        Thiết kế
                    </button>
                    <button 
                        onClick={() => setActiveTab('summary')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'summary' ? 'bg-white dark:bg-pru-card text-pru-red shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        Minh họa ({totalFee > 0 ? (totalFee/1000000).toFixed(1) + 'tr' : '0'})
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6 overflow-y-auto lg:overflow-hidden">
                    
                    {/* LEFT COLUMN: CONFIGURATOR (Visible on 'design' tab or desktop) */}
                    <div className={`lg:col-span-7 h-full flex flex-col gap-4 p-4 lg:p-0 lg:overflow-y-auto pb-24 lg:pb-0 ${activeTab === 'design' ? 'block' : 'hidden lg:block'}`}>
                        
                        {/* 1. CUSTOMER INFO */}
                        <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                            <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center">
                                <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mr-2 text-gray-600 dark:text-gray-300">1</span>
                                Thông tin khách hàng (BMBH)
                            </h3>
                            <div className="space-y-3">
                                <SearchableCustomerSelect 
                                    customers={customers} 
                                    value={selectedCustomer?.fullName || ''} 
                                    onChange={handleCustomerSelect} 
                                    placeholder="Tìm khách hàng..." 
                                />
                                {!selectedCustomer && (
                                    <div className="flex items-center gap-2 mb-2">
                                        <input type="checkbox" id="manual" checked={manualMode} onChange={e => {setManualMode(e.target.checked); setSelectedCustomer(null); setFullName('');}} className="accent-pru-red w-4 h-4" />
                                        <label htmlFor="manual" className="text-sm text-gray-600 dark:text-gray-300">Nhập tay (Khách vãng lai)</label>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2 md:col-span-1">
                                        <label className="label-text">Họ tên</label>
                                        <input className="input-field" value={fullName} onChange={e => setFullName(e.target.value)} disabled={!manualMode} />
                                    </div>
                                    <div>
                                        <label className="label-text">Năm sinh</label>
                                        <input type="number" className="input-field" value={birthYear} onChange={e => setBirthYear(Number(e.target.value))} disabled={!manualMode} />
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
                        {/* REMOVED overflow-hidden to allow dropdowns (if any) to show properly */}
                        <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-xl"></div>
                            <h3 className="text-xs font-bold text-blue-600 uppercase mb-3 flex items-center ml-2">
                                <span className="w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mr-2">2</span>
                                Sản phẩm chính
                            </h3>
                            <div className="space-y-3">
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
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label-text">STBH (Mệnh giá)</label>
                                        <CurrencyInput className="input-field font-bold text-blue-700" value={mainProduct.sumAssured} onChange={v => setMainProduct({...mainProduct, sumAssured: v})} />
                                    </div>
                                    <div>
                                        <label className="label-text">Thời hạn đóng phí</label>
                                        <select className="input-field" value={mainProduct.paymentTerm} onChange={e => setMainProduct({...mainProduct, paymentTerm: Number(e.target.value)})}>
                                            {Array.from({length: 20}, (_, i) => i + 10).map(y => <option key={y} value={y}>{y} năm</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg flex justify-between items-center border border-blue-100 dark:border-blue-800/30">
                                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">Phí chính dự kiến</span>
                                    <span className="text-base font-bold text-blue-700 dark:text-blue-300">{mainProduct.fee.toLocaleString()} đ</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. RIDERS */}
                        {/* REMOVED overflow-hidden to fix dropdown clipping issue */}
                        <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-orange-500 rounded-l-xl"></div>
                            <div className="flex justify-between items-center mb-3 ml-2">
                                <h3 className="text-xs font-bold text-orange-600 uppercase flex items-center">
                                    <span className="w-5 h-5 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center mr-2">3</span>
                                    Sản phẩm bổ trợ
                                </h3>
                                <button onClick={addRider} className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition font-bold shadow-sm">+ Thêm Rider</button>
                            </div>
                            
                            <div className="space-y-4">
                                {riders.map((rider, idx) => {
                                    const prodDef = products.find(p => p.id === rider.productId);
                                    const isHealth = prodDef?.calculationType === ProductCalculationType.HEALTH_CARE;
                                    const isAccident = prodDef?.calculationType === ProductCalculationType.RATE_PER_1000_OCCUPATION;
                                    const needsTerm = prodDef?.calculationType === ProductCalculationType.RATE_PER_1000_TERM || prodDef?.calculationType === ProductCalculationType.RATE_PER_1000_AGE_GENDER;
                                    
                                    // Find job hint for the rider's insured person
                                    const riderInsured = customers.find(c => c.fullName === rider.insuredName);
                                    const insuredJob = riderInsured?.job || riderInsured?.occupation || 'Chưa rõ';

                                    return (
                                        <div key={rider.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative group animate-fade-in">
                                            <button onClick={() => removeRider(idx)} className="absolute top-2 right-2 w-6 h-6 bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded-full flex items-center justify-center transition"><i className="fas fa-times text-xs"></i></button>
                                            
                                            <div className="space-y-3 pr-6">
                                                {/* Rider Selection */}
                                                <div>
                                                    <label className="label-text">Tên sản phẩm</label>
                                                    <select 
                                                        className="input-field py-2 text-sm font-medium"
                                                        value={rider.productId}
                                                        onChange={(e) => {
                                                            const pId = e.target.value;
                                                            const p = riderProductsList.find(pr => pr.id === pId);
                                                            
                                                            let attributes = { ...rider.attributes };
                                                            if (p?.calculationType === ProductCalculationType.HEALTH_CARE) {
                                                                attributes = { plan: HTVKPlan.NANG_CAO, package: HTVKPackage.STANDARD };
                                                            } else {
                                                                attributes = { occupationGroup: 1, paymentTerm: 10 }; // Reset defaults
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
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    {/* Insured Person */}
                                                    <div className="col-span-2 md:col-span-1">
                                                        <SearchableCustomerSelect 
                                                            customers={customers} 
                                                            value={rider.insuredName} 
                                                            onChange={c => updateRider(idx, { insuredName: c.fullName })} 
                                                            className="text-sm"
                                                            label="Người được BH"
                                                            placeholder="Chọn người thân"
                                                        />
                                                    </div>
                                                    
                                                    {/* Dynamic Inputs */}
                                                    {isHealth ? (
                                                        <div className="col-span-2 md:col-span-1">
                                                            <label className="label-text">Chương trình</label>
                                                            <select 
                                                                className="input-field py-2"
                                                                value={rider.attributes?.plan || HTVKPlan.NANG_CAO}
                                                                onChange={(e) => updateRider(idx, { attributes: { plan: e.target.value } })}
                                                            >
                                                                {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <div className="col-span-2 md:col-span-1">
                                                            <label className="label-text">Số tiền BH</label>
                                                            <CurrencyInput 
                                                                className="input-field py-2" 
                                                                value={rider.sumAssured} 
                                                                onChange={v => updateRider(idx, { sumAssured: v })} 
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Occupation Input (Conditional) */}
                                                    {isAccident && (
                                                        <div className="col-span-2 bg-orange-50 dark:bg-orange-900/10 p-2 rounded-lg border border-orange-100 dark:border-orange-900/30">
                                                            <label className="label-text text-orange-700 flex justify-between">
                                                                Nhóm nghề
                                                                <span className="text-[10px] bg-white dark:bg-black px-1.5 rounded border border-orange-200 text-orange-600 font-normal">Nghề: {insuredJob}</span>
                                                            </label>
                                                            <select 
                                                                className="input-field py-2 text-xs bg-white dark:bg-gray-900"
                                                                value={rider.attributes?.occupationGroup || 1} 
                                                                onChange={(e) => updateRider(idx, { attributes: { occupationGroup: Number(e.target.value) } })}
                                                            >
                                                                <option value="1">Nhóm 1 (Hành chính/Văn phòng)</option>
                                                                <option value="2">Nhóm 2 (Đi lại/Quản lý hiện trường)</option>
                                                                <option value="3">Nhóm 3 (Lao động nhẹ/Có tay nghề)</option>
                                                                <option value="4">Nhóm 4 (Lao động nặng/Nguy hiểm)</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Term Input (Conditional) */}
                                                    {needsTerm && (
                                                        <div className="col-span-2 md:col-span-1">
                                                            <label className="label-text text-blue-600">Thời hạn (Năm)</label>
                                                            <input 
                                                                type="number" 
                                                                className="input-field py-2 text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/10 border-blue-200" 
                                                                value={rider.attributes?.paymentTerm || 10} 
                                                                onChange={e => updateRider(idx, { attributes: { paymentTerm: Number(e.target.value) } })}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-700 pt-2">
                                                    <span className="text-xs text-gray-400 font-medium">Phí bổ trợ:</span>
                                                    <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{rider.fee.toLocaleString()} đ</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {riders.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">Chưa có sản phẩm bổ trợ nào.</p>}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: SUMMARY TABLE (Visible on 'summary' tab or desktop) */}
                    <div className={`lg:col-span-5 h-full flex flex-col gap-4 p-4 lg:p-0 lg:overflow-y-auto ${activeTab === 'summary' ? 'block' : 'hidden lg:block'}`}>
                        
                        {/* FEE BREAKDOWN TABLE */}
                        <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex-1 overflow-hidden flex flex-col">
                            <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center mb-4 text-sm">
                                <i className="fas fa-file-invoice-dollar text-indigo-500 mr-2"></i> Bảng minh họa quyền lợi
                            </h3>

                            <div className="overflow-y-auto flex-1">
                                <table className="w-full text-xs md:text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold sticky top-0 z-10">
                                        <tr>
                                            <th className="px-2 py-2">Sản phẩm</th>
                                            <th className="px-2 py-2 text-right">STBH</th>
                                            <th className="px-2 py-2 text-right">Phí (VNĐ)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {/* Main Product Row */}
                                        {mainProduct.id && (
                                            <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                                                <td className="px-2 py-3">
                                                    <div className="font-bold text-blue-800 dark:text-blue-300 mb-0.5">{mainProduct.name}</div>
                                                    <div className="text-[10px] text-gray-500">NĐBH: {fullName || '---'}</div>
                                                </td>
                                                <td className="px-2 py-3 text-right font-medium">{mainProduct.sumAssured.toLocaleString()}</td>
                                                <td className="px-2 py-3 text-right font-bold text-blue-700 dark:text-blue-400">{mainProduct.fee.toLocaleString()}</td>
                                            </tr>
                                        )}

                                        {/* Rider Rows */}
                                        {riders.map((r, i) => (
                                            <tr key={i}>
                                                <td className="px-2 py-3">
                                                    <div className="text-gray-700 dark:text-gray-300 mb-0.5 flex items-start">
                                                        <span className="text-gray-300 mr-1">└</span> {r.productName || '---'}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 pl-3">NĐBH: {r.insuredName}</div>
                                                </td>
                                                <td className="px-2 py-3 text-right text-gray-600 dark:text-gray-400">
                                                    {r.attributes?.plan ? r.attributes.plan : r.sumAssured.toLocaleString()}
                                                </td>
                                                <td className="px-2 py-3 text-right font-medium text-gray-800 dark:text-gray-200">{r.fee.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        
                                        {riders.length === 0 && !mainProduct.id && (
                                            <tr>
                                                <td colSpan={3} className="text-center py-10 text-gray-400 italic text-xs">Vui lòng chọn sản phẩm bên mục Thiết kế.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* STICKY TOTAL BAR (Mobile & Desktop) */}
                <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-pru-card border-t border-gray-200 dark:border-gray-800 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                    <div className="max-w-screen-2xl mx-auto flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Tổng phí đóng (Năm)</span>
                            <span className="text-xl md:text-2xl font-black text-pru-red dark:text-red-400">{totalFee.toLocaleString()} <span className="text-xs font-normal text-gray-500">VNĐ</span></span>
                        </div>
                        <button 
                            onClick={handleSave} 
                            className="bg-pru-red hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center transition transform active:scale-95"
                        >
                            <i className="fas fa-save mr-2"></i> <span className="hidden md:inline">Lưu Bảng Minh Họa</span><span className="md:hidden">Lưu</span>
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                .label-text { display: block; font-size: 0.7rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 1px solid #ed1b2e; }
                .animate-fade-in { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default ProductAdvisoryPage;
