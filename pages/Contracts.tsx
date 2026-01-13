import React, { useState, useMemo } from 'react';
import { Contract, Customer, Product, ProductType, ContractStatus, PaymentFrequency, ProductCalculationType, ContractProduct, Gender, ProductStatus } from '../types';
import { SearchableCustomerSelect, CurrencyInput, ConfirmModal, formatDateVN } from '../components/Shared';
import { calculateProductFee } from '../services/productCalculator';
import { HTVKPlan, HTVKPackage } from '../data/pruHanhTrangVuiKhoe';

interface ContractsPageProps {
    contracts: Contract[];
    customers: Customer[];
    products: Product[];
    onAdd: (c: Contract) => Promise<void>;
    onUpdate: (c: Contract) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const ContractsPage: React.FC<ContractsPageProps> = ({ contracts, customers, products, onAdd, onUpdate, onDelete }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Modal
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string, name: string}>({ isOpen: false, id: '', name: '' });

    const defaultContract: Contract = {
        id: '',
        contractNumber: '',
        customerId: '',
        effectiveDate: new Date().toISOString().split('T')[0],
        nextPaymentDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        status: ContractStatus.ACTIVE,
        paymentFrequency: PaymentFrequency.ANNUAL,
        totalFee: 0,
        mainProduct: {
            productId: '',
            productName: '',
            insuredName: '',
            fee: 0,
            sumAssured: 0
        },
        riders: []
    };

    const [formData, setFormData] = useState<Contract>(defaultContract);

    const filteredContracts = contracts.filter(c => {
        const customer = customers.find(cus => cus.id === c.customerId);
        const searchMatch = c.contractNumber.includes(searchTerm) || (customer && customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()));
        const statusMatch = filterStatus === 'all' || c.status === filterStatus;
        return searchMatch && statusMatch;
    });

    const calculateAge = (dob: string) => {
        if (!dob) return 0;
        return new Date().getFullYear() - new Date(dob).getFullYear();
    };

    const handleOpenAdd = () => {
        setFormData(defaultContract);
        setIsEditing(false);
        setShowModal(true);
    };

    const handleOpenEdit = (c: Contract) => {
        setFormData(c);
        setIsEditing(true);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.contractNumber || !formData.customerId) return alert("Vui lòng nhập số HĐ và chọn khách hàng");
        
        // Recalculate total fee just in case
        const total = formData.mainProduct.fee + formData.riders.reduce((sum, r) => sum + r.fee, 0);
        const finalData = { ...formData, totalFee: total };

        if (isEditing) {
            await onUpdate(finalData);
        } else {
            await onAdd(finalData);
        }
        setShowModal(false);
    };

    const handleUpdateMainProduct = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        
        const customer = customers.find(c => c.id === formData.customerId);
        let fee = 0;
        if (customer) {
            const age = calculateAge(customer.dob);
            fee = calculateProductFee({
                product,
                calculationType: product.calculationType || ProductCalculationType.FIXED,
                productCode: product.code,
                sumAssured: formData.mainProduct.sumAssured,
                age,
                gender: customer.gender,
                term: formData.mainProduct.attributes?.paymentTerm || 15,
                occupationGroup: 1 // Main product usually group 1 risk for generic calculation or irrelevant
            });
        }

        setFormData(prev => ({
            ...prev,
            mainProduct: {
                ...prev.mainProduct,
                productId: product.id,
                productName: product.name,
                fee
            }
        }));
    };

    const handleUpdateMainFee = (updates: Partial<ContractProduct>) => {
        // Similar logic to update fee if SA changes
        const currentMain = { ...formData.mainProduct, ...updates };
        const product = products.find(p => p.id === currentMain.productId);
        const customer = customers.find(c => c.id === formData.customerId);
        
        if (product && customer) {
             const age = calculateAge(customer.dob);
             currentMain.fee = calculateProductFee({
                product,
                calculationType: product.calculationType || ProductCalculationType.FIXED,
                productCode: product.code,
                sumAssured: currentMain.sumAssured,
                age,
                gender: customer.gender,
                term: currentMain.attributes?.paymentTerm || 15,
                occupationGroup: 1
            });
        }
        
        setFormData(prev => ({ ...prev, mainProduct: currentMain }));
    };

    const addRider = () => {
        setFormData(prev => ({
            ...prev,
            riders: [...prev.riders, {
                productId: '',
                productName: '',
                insuredName: customers.find(c => c.id === prev.customerId)?.fullName || '',
                fee: 0,
                sumAssured: 0,
                attributes: {}
            }]
        }));
    };

    const removeRider = (index: number) => {
        const newRiders = [...formData.riders];
        newRiders.splice(index, 1);
        setFormData(prev => ({ ...prev, riders: newRiders }));
    };

    const updateRider = (index: number, updates: Partial<ContractProduct>) => {
        const newRiders = [...formData.riders];
        const currentRider = { ...newRiders[index], ...updates };
        
        // Auto update product name if ID changes
        if (updates.productId) {
            const p = products.find(prod => prod.id === updates.productId);
            if (p) {
                currentRider.productName = p.name;
                // Default attributes for Health Care
                if (p.calculationType === ProductCalculationType.HEALTH_CARE) {
                    currentRider.attributes = { ...currentRider.attributes, plan: HTVKPlan.NANG_CAO, package: HTVKPackage.STANDARD };
                }
            }
        }

        // Calculate Fee
        const product = products.find(p => p.id === currentRider.productId);
        const customer = customers.find(c => c.fullName === currentRider.insuredName) || customers.find(c => c.id === formData.customerId); // Fallback to owner
        
        if (product && customer) {
            const age = calculateAge(customer.dob);
            currentRider.fee = calculateProductFee({
                product,
                calculationType: product.calculationType || ProductCalculationType.FIXED,
                productCode: product.code,
                sumAssured: currentRider.sumAssured,
                age,
                gender: customer.gender,
                term: currentRider.attributes?.paymentTerm || 10,
                occupationGroup: currentRider.attributes?.occupationGroup || 1,
                htvkPlan: currentRider.attributes?.plan as HTVKPlan,
                htvkPackage: currentRider.attributes?.package as HTVKPackage
            });
        }

        newRiders[index] = currentRider;
        setFormData(prev => ({ ...prev, riders: newRiders }));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Quản lý Hợp đồng</h1>
                <button onClick={handleOpenAdd} className="bg-pru-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md font-bold flex items-center">
                    <i className="fas fa-plus mr-2"></i>Thêm Hợp đồng
                </button>
            </div>

            {/* FILTERS */}
            <div className="bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex gap-4 items-center">
                <div className="relative flex-1">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-pru-red" placeholder="Tìm số HĐ, tên khách hàng..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <select className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">Tất cả trạng thái</option>
                    {Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* LIST */}
            <div className="grid grid-cols-1 gap-4">
                {filteredContracts.map(contract => {
                    const customer = customers.find(c => c.id === contract.customerId);
                    return (
                        <div key={contract.id} className="bg-white dark:bg-pru-card p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition group">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-pru-red font-black text-lg">{contract.contractNumber}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${contract.status === ContractStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{contract.status}</span>
                                </div>
                                <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{customer?.fullName || 'Khách hàng không tồn tại'}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{contract.mainProduct.productName} + {contract.riders.length} riders</div>
                            </div>
                            
                            <div className="flex flex-col md:items-end text-sm text-gray-600 dark:text-gray-300">
                                <div><i className="fas fa-calendar-alt mr-1 w-4"></i> Hiệu lực: {formatDateVN(contract.effectiveDate)}</div>
                                <div><i className="fas fa-clock mr-1 w-4"></i> Tới hạn: <span className={new Date(contract.nextPaymentDate) < new Date() ? 'text-red-500 font-bold' : ''}>{formatDateVN(contract.nextPaymentDate)}</span></div>
                                <div className="font-bold mt-1 text-gray-800 dark:text-gray-200">Phí: {contract.totalFee.toLocaleString()} đ / {contract.paymentFrequency}</div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => handleOpenEdit(contract)} className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-100 transition"><i className="fas fa-pen text-xs"></i></button>
                                <button onClick={() => setDeleteConfirm({isOpen: true, id: contract.id, name: contract.contractNumber})} className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-100 transition"><i className="fas fa-trash text-xs"></i></button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{isEditing ? 'Cập nhật Hợp Đồng' : 'Thêm Hợp Đồng Mới'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* GENERAL INFO */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="label-text">Số Hợp Đồng</label><input className="input-field" value={formData.contractNumber} onChange={e => setFormData({...formData, contractNumber: e.target.value})} /></div>
                                <div>
                                    <label className="label-text">Khách Hàng (Bên mua BH)</label>
                                    <SearchableCustomerSelect 
                                        customers={customers} 
                                        value={customers.find(c => c.id === formData.customerId)?.fullName || ''} 
                                        onChange={c => setFormData({...formData, customerId: c.id, mainProduct: {...formData.mainProduct, insuredName: c.fullName}})} 
                                    />
                                </div>
                                <div><label className="label-text">Ngày hiệu lực</label><input type="date" className="input-field" value={formData.effectiveDate} onChange={e => setFormData({...formData, effectiveDate: e.target.value})} /></div>
                                <div><label className="label-text">Ngày đóng phí tới</label><input type="date" className="input-field" value={formData.nextPaymentDate} onChange={e => setFormData({...formData, nextPaymentDate: e.target.value})} /></div>
                                <div><label className="label-text">Định kỳ đóng phí</label><select className="input-field" value={formData.paymentFrequency} onChange={(e: any) => setFormData({...formData, paymentFrequency: e.target.value})}>{Object.values(PaymentFrequency).map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="label-text">Trạng thái</label><select className="input-field" value={formData.status} onChange={(e: any) => setFormData({...formData, status: e.target.value})}>{Object.values(ContractStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            </div>

                            {/* MAIN PRODUCT */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <h4 className="font-bold text-blue-700 dark:text-blue-300 mb-3 text-sm uppercase">Sản phẩm chính</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="label-text">Tên sản phẩm</label>
                                        <select className="input-field" value={formData.mainProduct.productId} onChange={(e) => handleUpdateMainProduct(e.target.value)}>
                                            <option value="">-- Chọn sản phẩm --</option>
                                            {products.filter(p => p.type === ProductType.MAIN && p.status === ProductStatus.ACTIVE).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div><label className="label-text">Người được BH</label><input className="input-field bg-gray-100 dark:bg-gray-800" value={formData.mainProduct.insuredName} readOnly /></div>
                                    <div>
                                        <label className="label-text">Số tiền bảo hiểm (STBH)</label>
                                        <CurrencyInput className="input-field" value={formData.mainProduct.sumAssured} onChange={v => handleUpdateMainFee({sumAssured: v})} />
                                    </div>
                                    <div>
                                        <label className="label-text">Phí bảo hiểm (VNĐ)</label>
                                        <CurrencyInput className="input-field font-bold text-blue-600" value={formData.mainProduct.fee} onChange={v => setFormData({...formData, mainProduct: {...formData.mainProduct, fee: v}})} />
                                    </div>
                                </div>
                            </div>

                            {/* RIDERS */}
                            <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-orange-700 dark:text-orange-300 text-sm uppercase">Sản phẩm bổ trợ</h4>
                                    <button onClick={addRider} className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100 px-2 py-1 rounded font-bold hover:bg-orange-300 transition">+ Thêm Rider</button>
                                </div>
                                <div className="space-y-3">
                                    {formData.riders.map((rider, idx) => {
                                        const riderProdInfo = products.find(p => p.id === rider.productId);
                                        const isHealth = riderProdInfo?.calculationType === ProductCalculationType.HEALTH_CARE;

                                        return (
                                            <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-200 dark:border-orange-800/50 shadow-sm relative group">
                                                <button onClick={() => removeRider(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i className="fas fa-times-circle"></i></button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="label-text">Sản phẩm</label>
                                                        <select className="input-field py-1.5 text-xs" value={rider.productId} onChange={(e) => updateRider(idx, { productId: e.target.value })}>
                                                            <option value="">-- Chọn Rider --</option>
                                                            {products.filter(p => p.type === ProductType.RIDER && p.status === ProductStatus.ACTIVE).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="label-text">Người được BH</label>
                                                        <SearchableCustomerSelect customers={customers} value={rider.insuredName} onChange={c => updateRider(idx, { insuredName: c.fullName })} className="text-xs" />
                                                    </div>
                                                    
                                                    {/* Dynamic Fields based on Product Type */}
                                                    {isHealth ? (
                                                        <>
                                                            <div>
                                                                <label className="label-text">Chương trình</label>
                                                                <select className="input-field py-1.5 text-xs" value={rider.attributes?.plan || HTVKPlan.NANG_CAO} onChange={(e) => updateRider(idx, { attributes: { ...rider.attributes, plan: e.target.value } })}>
                                                                    {Object.values(HTVKPlan).map(p => <option key={p} value={p}>{p}</option>)}
                                                                </select>
                                                            </div>
                                                            {/* Snippet Logic Integration */}
                                                            {(rider.attributes?.plan === HTVKPlan.TOAN_DIEN || rider.attributes?.plan === HTVKPlan.HOAN_HAO) && (
                                                                <div>
                                                                    <label className="label-text text-[10px] uppercase font-bold text-gray-400">Gói</label>
                                                                    <select className="input-field text-sm py-1.5" value={rider.attributes?.package || HTVKPackage.GOI_1} onChange={(e) => updateRider(idx, { attributes: { ...rider.attributes, package: e.target.value } })}>
                                                                        <option value={HTVKPackage.STANDARD}>Chuẩn</option>
                                                                        <option value={HTVKPackage.GOI_1}>Gói 1 (Có MT)</option>
                                                                        <option value={HTVKPackage.GOI_2}>Gói 2 (Không MT)</option>
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div>
                                                            <label className="label-text">Số tiền bảo hiểm</label>
                                                            <CurrencyInput className="input-field py-1.5 text-xs" value={rider.sumAssured} onChange={v => updateRider(idx, { sumAssured: v })} />
                                                        </div>
                                                    )}

                                                    <div>
                                                        <label className="label-text">Phí (VNĐ)</label>
                                                        <CurrencyInput className="input-field py-1.5 text-xs font-bold text-orange-600" value={rider.fee} onChange={v => updateRider(idx, { fee: v })} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl flex justify-between items-center">
                            <div className="text-sm">
                                <span className="text-gray-500 dark:text-gray-400">Tổng phí dự kiến:</span>
                                <span className="font-bold text-lg text-pru-red dark:text-red-400 ml-2">{(formData.mainProduct.fee + formData.riders.reduce((s,r) => s + r.fee, 0)).toLocaleString()} đ</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy</button>
                                <button onClick={handleSave} className="px-5 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Hợp Đồng</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa hợp đồng?" message={`Bạn có chắc muốn xóa hợp đồng số ${deleteConfirm.name}?`} onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })} />

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

export default ContractsPage;