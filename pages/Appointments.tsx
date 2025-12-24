
import React, { useState, useMemo, useEffect } from 'react';
import { Appointment, Customer, AppointmentStatus, AppointmentType, Contract, AppointmentResult, ContractStatus } from '../types';
import { ConfirmModal, SearchableCustomerSelect, formatDateVN } from '../components/Shared';

interface AppointmentsPageProps {
    appointments: Appointment[];
    customers: Customer[];
    contracts: Contract[];
    onAdd: (a: Appointment) => void;
    onUpdate: (a: Appointment) => void;
    onDelete: (id: string) => void;
}

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ appointments, customers, contracts, onAdd, onUpdate, onDelete }) => {
    // --- STATE ---
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isMonthExpanded, setIsMonthExpanded] = useState(false); // Collapsible calendar for mobile
    
    // Modals
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, id: string}>({ isOpen: false, id: '' });
    
    // Outcome Modal
    const [outcomeModal, setOutcomeModal] = useState<{isOpen: boolean, appointment: Appointment | null}>({isOpen: false, appointment: null});
    const [outcomeData, setOutcomeData] = useState<{result: AppointmentResult, note: string}>({result: AppointmentResult.DONE, note: ''});

    // Form Data
    const defaultForm: Appointment = {
        id: '', customerId: '', customerName: '', date: new Date().toISOString().split('T')[0], 
        time: '09:00', type: AppointmentType.CONSULTATION, status: AppointmentStatus.UPCOMING, note: ''
    };
    const [formData, setFormData] = useState<Appointment>(defaultForm);

    // --- AUTOMATION LOGIC ---
    const handleGenerateTasks = () => {
        let count = 0;
        const today = new Date();
        
        customers.forEach(c => {
            const dob = new Date(c.dob);
            const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
            if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
            
            const diffTime = nextBday.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 7) {
                const bdayStr = nextBday.toISOString().split('T')[0];
                const exists = appointments.some(a => a.customerId === c.id && a.type === AppointmentType.BIRTHDAY && a.date === bdayStr);
                if (!exists) {
                    onAdd({
                        id: '', customerId: c.id, customerName: c.fullName, date: bdayStr,
                        time: '09:00', type: AppointmentType.BIRTHDAY, status: AppointmentStatus.UPCOMING,
                        note: `Chúc mừng sinh nhật ${c.fullName}`
                    });
                    count++;
                }
            }
        });

        contracts.forEach(c => {
            if (c.status !== ContractStatus.ACTIVE) return;
            const dueDate = new Date(c.nextPaymentDate);
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 15) {
                const dateStr = dueDate.toISOString().split('T')[0];
                const exists = appointments.some(a => a.customerId === c.customerId && a.type === AppointmentType.FEE_REMINDER && a.date === dateStr);
                if (!exists) {
                     const customer = customers.find(cus => cus.id === c.customerId);
                     onAdd({
                        id: '', customerId: c.customerId, customerName: customer?.fullName || 'Khách hàng',
                        date: dateStr, time: '08:30', type: AppointmentType.FEE_REMINDER, status: AppointmentStatus.UPCOMING,
                        note: `Nhắc đóng phí HĐ ${c.contractNumber}: ${c.totalFee.toLocaleString()}đ`
                    });
                    count++;
                }
            }
        });

        alert(count > 0 ? `Đã tạo tự động ${count} công việc!` : "Không có công việc mới nào cần tạo.");
    };

    // --- CALENDAR LOGIC ---
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const startDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: startDayIndex }, (_, i) => i);

    // Get only the current week for collapsed view
    const weekDays = useMemo(() => {
        const selDate = new Date(selectedDate);
        const dayOfWeek = selDate.getDay();
        const monday = new Date(selDate);
        monday.setDate(selDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d;
        });
    }, [selectedDate]);

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

    const dailyAppointments = useMemo(() => {
        return appointments.filter(a => a.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time));
    }, [appointments, selectedDate]);

    // --- HANDLERS ---
    const handleOpenAdd = (date?: string) => { 
        setFormData({...defaultForm, date: date || selectedDate}); 
        setIsEditing(false); 
        setShowModal(true); 
    };
    
    const handleOpenEdit = (a: Appointment) => { setFormData(a); setIsEditing(true); setShowModal(true); };
    
    const handleSave = () => {
        if(!formData.customerId) return alert("Vui lòng chọn khách hàng");
        isEditing ? onUpdate(formData) : onAdd(formData);
        setShowModal(false);
    };

    const handleComplete = (a: Appointment) => {
        setOutcomeData({result: AppointmentResult.SUCCESS, note: ''});
        setOutcomeModal({isOpen: true, appointment: a});
    };

    const submitOutcome = () => {
        if (outcomeModal.appointment) {
            onUpdate({
                ...outcomeModal.appointment,
                status: AppointmentStatus.COMPLETED,
                outcome: outcomeData.result,
                outcomeNote: outcomeData.note
            });
            setOutcomeModal({isOpen: false, appointment: null});
        }
    };

    const getTypeColor = (type: AppointmentType) => {
        switch(type) {
            case AppointmentType.CONSULTATION: return 'border-purple-500 text-purple-700 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-600';
            case AppointmentType.FEE_REMINDER: return 'border-orange-500 text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-600';
            case AppointmentType.BIRTHDAY: return 'border-pink-500 text-pink-700 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-600';
            case AppointmentType.CARE_CALL: return 'border-green-500 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-300 dark:border-green-600';
            default: return 'border-gray-500 text-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';
        }
    };

    const getTypeIcon = (type: AppointmentType) => {
        switch(type) {
            case AppointmentType.CONSULTATION: return 'fa-comments';
            case AppointmentType.FEE_REMINDER: return 'fa-file-invoice-dollar';
            case AppointmentType.BIRTHDAY: return 'fa-birthday-cake';
            case AppointmentType.CARE_CALL: return 'fa-phone-alt';
            case AppointmentType.PAPERWORK: return 'fa-file-signature';
            default: return 'fa-calendar-check';
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 dark:bg-black relative transition-colors">
            
            {/* 1. Header (Static on top) */}
            <div className="bg-white dark:bg-pru-card px-4 py-3 flex justify-between items-center shadow-sm border-b border-gray-100 dark:border-gray-800 flex-shrink-0 z-20">
                <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-chevron-left"></i></button>
                    <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 uppercase">Tháng {currentDate.getMonth() + 1}/{currentDate.getFullYear()}</h2>
                    <button onClick={nextMonth} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-chevron-right"></i></button>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleGenerateTasks} className="text-xs font-bold text-pru-red bg-red-50 dark:bg-red-900/20 dark:border-red-900/50 px-3 py-1.5 rounded-full border border-red-100">
                        <i className="fas fa-magic mr-1"></i> Tự động
                    </button>
                    <button onClick={() => setIsMonthExpanded(!isMonthExpanded)} className="text-xs font-bold text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full lg:hidden">
                        <i className={`fas ${isMonthExpanded ? 'fa-compress-alt' : 'fa-expand-alt'} mr-1`}></i> {isMonthExpanded ? 'Thu gọn' : 'Xem tháng'}
                    </button>
                </div>
            </div>

            {/* 2. Calendar View (Collapsible for Mobile, Sidebar for Desktop) */}
            <div className={`bg-white dark:bg-pru-card shadow-sm border-b border-gray-100 dark:border-gray-800 transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 z-10 ${isMonthExpanded ? 'max-h-[400px]' : 'max-h-[100px] lg:max-h-full lg:hidden'}`}>
                {/* Month Grid */}
                <div className="p-4">
                    <div className="grid grid-cols-7 mb-2 text-center text-[10px] font-bold text-gray-400 uppercase">
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {blanks.map(x => <div key={`blank-${x}`} className="h-10"></div>)}
                        {days.map(d => {
                            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isSelected = selectedDate === dateStr;
                            const isToday = new Date().toISOString().split('T')[0] === dateStr;
                            const hasApps = appointments.some(a => a.date === dateStr);
                            
                            return (
                                <button 
                                    key={d} 
                                    onClick={() => { setSelectedDate(dateStr); setIsMonthExpanded(false); }}
                                    className={`relative h-10 rounded-lg flex flex-col items-center justify-center transition-all ${
                                        isSelected ? 'bg-pru-red text-white' : 
                                        isToday ? 'bg-red-50 dark:bg-red-900/30 text-pru-red border border-red-100 dark:border-red-900/50' : 
                                        'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <span className="text-sm font-bold">{d}</span>
                                    {hasApps && !isSelected && <div className="w-1 h-1 bg-pru-red rounded-full mt-0.5"></div>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Week View for Mobile (When month is collapsed) */}
            {!isMonthExpanded && (
                <div className="bg-white dark:bg-pru-card border-b border-gray-100 dark:border-gray-800 p-2 flex justify-around items-center flex-shrink-0 lg:hidden overflow-x-auto">
                    {weekDays.map((d, i) => {
                        const dateStr = d.toISOString().split('T')[0];
                        const isSelected = selectedDate === dateStr;
                        const isToday = new Date().toISOString().split('T')[0] === dateStr;
                        const hasApps = appointments.some(a => a.date === dateStr);
                        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

                        return (
                            <button 
                                key={i}
                                onClick={() => setSelectedDate(dateStr)}
                                className={`flex flex-col items-center p-2 min-w-[45px] rounded-xl transition-all ${
                                    isSelected ? 'bg-pru-red text-white scale-110 shadow-md' : 'text-gray-500 dark:text-gray-400'
                                }`}
                            >
                                <span className="text-[10px] uppercase mb-1 font-bold">{dayNames[d.getDay()]}</span>
                                <span className={`text-sm font-black ${isToday && !isSelected ? 'text-pru-red' : ''}`}>{d.getDate()}</span>
                                {hasApps && !isSelected && <div className="w-1 h-1 bg-red-400 rounded-full mt-1"></div>}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 3. Main Content: Agenda Timeline */}
            <div className="flex-1 flex overflow-hidden">
                {/* Desktop Sidebar Calendar */}
                <div className="hidden lg:block w-80 bg-white dark:bg-pru-card border-r border-gray-200 dark:border-gray-800 p-4 overflow-y-auto">
                    <div className="mb-6">
                        <div className="grid grid-cols-7 mb-4 text-center text-[10px] font-bold text-gray-400 uppercase">
                            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => <div key={d}>{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {blanks.map(x => <div key={`b-${x}`} className="h-10"></div>)}
                            {days.map(d => {
                                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                const isSelected = selectedDate === dateStr;
                                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                return (
                                    <button key={d} onClick={() => setSelectedDate(dateStr)} className={`h-10 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${
                                        isSelected ? 'bg-pru-red text-white shadow-md' : 
                                        isToday ? 'text-pru-red bg-red-50 dark:bg-red-900/30' : 
                                        'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}>
                                        {d}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Thống kê tháng</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Tổng công việc</span><span className="font-bold text-gray-800 dark:text-gray-200">{appointments.filter(a => a.date.startsWith(currentDate.toISOString().substring(0,7))).length}</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Đã hoàn thành</span><span className="font-bold text-green-600 dark:text-green-400">{appointments.filter(a => a.date.startsWith(currentDate.toISOString().substring(0,7)) && a.status === AppointmentStatus.COMPLETED).length}</span></div>
                        </div>
                    </div>
                </div>

                {/* Agenda Timeline List */}
                <div className="flex-1 bg-gray-50 dark:bg-black/50 overflow-y-auto p-4 md:p-6 pb-24">
                    <div className="max-w-2xl mx-auto space-y-6 relative">
                        {/* Vertical Line */}
                        {dailyAppointments.length > 0 && (
                            <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-gray-200 dark:bg-gray-700 z-0"></div>
                        )}

                        {dailyAppointments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 dark:opacity-30">
                                <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 text-3xl"><i className="fas fa-calendar-day text-gray-400"></i></div>
                                <h3 className="font-bold text-gray-800 dark:text-gray-100">Không có lịch hẹn</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Hãy dành thời gian này để nghỉ ngơi hoặc chăm sóc gia đình.</p>
                            </div>
                        ) : (
                            dailyAppointments.map(a => (
                                <div key={a.id} className="relative z-10 pl-10">
                                    {/* Timeline Node */}
                                    <div className={`absolute left-0 top-6 w-8 h-8 rounded-full border-4 border-gray-50 dark:border-black flex items-center justify-center shadow-sm ${a.status === AppointmentStatus.COMPLETED ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-700 text-pru-red'}`}>
                                        <i className={`fas ${a.status === AppointmentStatus.COMPLETED ? 'fa-check' : getTypeIcon(a.type)} text-[10px]`}></i>
                                    </div>

                                    {/* Card */}
                                    <div className={`bg-white dark:bg-pru-card rounded-2xl p-4 shadow-sm border-l-4 group relative hover:shadow-md transition-shadow ${getTypeColor(a.type).split(' ')[0]}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{a.time}</span>
                                                <h4 className={`text-base font-bold text-gray-800 dark:text-gray-100 ${a.status === AppointmentStatus.COMPLETED ? 'line-through opacity-50' : ''}`}>{a.customerName}</h4>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => handleOpenEdit(a)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"><i className="fas fa-pen text-xs"></i></button>
                                                <button onClick={() => setDeleteConfirm({isOpen: true, id: a.id})} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition"><i className="fas fa-trash text-xs"></i></button>
                                            </div>
                                        </div>

                                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{a.note}</p>

                                        {/* Actions Footer */}
                                        <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-700">
                                            {a.status !== AppointmentStatus.COMPLETED ? (
                                                <>
                                                    <button 
                                                        onClick={() => handleComplete(a)}
                                                        className="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-xl hover:bg-green-700 transition"
                                                    >
                                                        Hoàn thành
                                                    </button>
                                                    <button 
                                                        onClick={() => {
                                                            const customer = customers.find(c => c.id === a.customerId);
                                                            if (customer) window.location.href = `tel:${customer.phone}`;
                                                        }}
                                                        className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center"
                                                    >
                                                        <i className="fas fa-phone-alt"></i>
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="flex-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-2 rounded-xl border border-gray-100 dark:border-gray-700">
                                                    <i className="fas fa-clipboard-check text-green-500"></i>
                                                    <span className="text-[10px] text-gray-600 dark:text-gray-300 italic">Kết quả: {a.outcome || 'Đã xong'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* 4. FAB - Fixed Action Button for Mobile */}
            <button 
                onClick={() => handleOpenAdd()}
                className="fixed bottom-6 right-6 w-14 h-14 bg-pru-red text-white rounded-full shadow-2xl flex items-center justify-center text-xl z-40 lg:bottom-10 lg:right-10 transform active:scale-95 transition-transform"
            >
                <i className="fas fa-plus"></i>
            </button>

            {/* MODALS (Preserved but restyled) */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-0 md:p-4">
                    <div className="bg-white dark:bg-pru-card rounded-t-3xl md:rounded-3xl w-full max-w-md p-6 shadow-2xl animate-slide-up md:animate-fade-in transition-colors">
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 md:hidden"></div>
                        <h3 className="text-xl font-bold mb-6 text-gray-800 dark:text-gray-100">{isEditing ? 'Sửa công việc' : 'Thêm công việc'}</h3>
                        <div className="space-y-4">
                            <SearchableCustomerSelect customers={customers} value={formData.customerName} onChange={c => setFormData({...formData, customerId: c.id, customerName: c.fullName})} label="Khách hàng" />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="label-text">Ngày</label><input type="date" className="input-field" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                                <div><label className="label-text">Giờ</label><input type="time" className="input-field" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} /></div>
                            </div>
                            <div>
                                <label className="label-text">Loại công việc</label>
                                <select className="input-field" value={formData.type} onChange={(e: any) => setFormData({...formData, type: e.target.value})}>
                                    {Object.values(AppointmentType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div><label className="label-text">Ghi chú chi tiết</label><textarea rows={3} className="input-field" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="VD: Mang theo thẻ chăm sóc sức khỏe..." /></div>
                        </div>
                        <div className="flex flex-col md:flex-row gap-3 mt-8">
                            <button onClick={handleSave} className="flex-1 bg-pru-red text-white py-3 rounded-2xl font-bold shadow-lg shadow-red-500/30">Lưu lịch trình</button>
                            <button onClick={() => setShowModal(false)} className="flex-1 py-3 text-gray-500 dark:text-gray-300 font-bold bg-gray-50 dark:bg-gray-700 rounded-2xl md:bg-white md:dark:bg-gray-800 md:border md:dark:border-gray-600">Hủy</button>
                        </div>
                    </div>
                </div>
            )}

            {/* OUTCOME MODAL */}
            {outcomeModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[110] p-0 md:p-4">
                    <div className="bg-white dark:bg-pru-card rounded-t-3xl md:rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-slide-up transition-colors">
                        <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6 md:hidden"></div>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500 text-2xl border border-green-100 dark:border-green-800"><i className="fas fa-check-circle"></i></div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Hoàn thành công việc</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ghi chú lại kết quả buổi làm việc nhé.</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="label-text">Kết quả</label>
                                <select className="input-field" value={outcomeData.result} onChange={(e: any) => setOutcomeData({...outcomeData, result: e.target.value})}>
                                    {Object.values(AppointmentResult).map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label-text">Ghi chú kết quả</label>
                                <textarea rows={2} className="input-field" value={outcomeData.note} onChange={e => setOutcomeData({...outcomeData, note: e.target.value})} placeholder="VD: Khách hàng hài lòng, hứa giới thiệu thêm..." />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 mt-8">
                             <button onClick={submitOutcome} className="bg-green-600 text-white py-3 rounded-2xl font-bold shadow-lg shadow-green-500/20">Xác nhận xong</button>
                             <button onClick={() => setOutcomeModal({isOpen: false, appointment: null})} className="py-3 text-gray-400 dark:text-gray-500 font-bold">Quay lại</button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={deleteConfirm.isOpen} title="Xóa lịch hẹn?" message="Dữ liệu này sẽ biến mất vĩnh viễn khỏi hành trình chăm sóc khách hàng. Bạn chắc chứ?" onConfirm={() => onDelete(deleteConfirm.id)} onClose={() => setDeleteConfirm({isOpen: false, id: ''})} />
            
            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.75rem; border-radius: 1rem; outline: none; font-size: 0.875rem; transition: all; background-color: #f9fafb; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; background-color: #fff; ring: 2px solid #fee2e2; }
                .dark .input-field:focus { background-color: #111827; ring: 1px solid #ed1b2e; }
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #9ca3af; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
                
                @keyframes slide-up {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                .animate-slide-up { animation: slide-up 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default AppointmentsPage;
