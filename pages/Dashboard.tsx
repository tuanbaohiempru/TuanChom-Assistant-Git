
import React, { useState, useMemo } from 'react';
import { AppState, ContractStatus, AppointmentStatus, CustomerStatus, ReadinessLevel, Contract, Customer, AppointmentType } from '../types';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatDateVN } from '../components/Shared';

interface DashboardProps {
  state: AppState;
  onUpdateContract: (c: Contract) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  const { customers, contracts, appointments, messageTemplates } = state;
  const [activeTab, setActiveTab] = useState<'tasks' | 'pipeline'>('tasks');
  
  // Action Modal State
  const [actionModal, setActionModal] = useState<{isOpen: boolean, type: 'call' | 'zalo', customer: Customer | null, content?: string}>({
      isOpen: false, type: 'call', customer: null
  });

  // --- 1. METRICS CALCULATION ---
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  // MDRT Tracking (Target: 1 Billion VND)
  const MDRT_TARGET = 1000000000; 
  const currentFYP = contracts
    .filter(c => new Date(c.effectiveDate).getFullYear() === currentYear && c.status === ContractStatus.ACTIVE)
    .reduce((sum, c) => sum + c.totalFee, 0);
  const mdrtProgress = Math.min((currentFYP / MDRT_TARGET) * 100, 100);

  // Monthly Revenue
  const revenueThisMonth = contracts
    .filter(c => {
        const d = new Date(c.effectiveDate);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && c.status === ContractStatus.ACTIVE;
    })
    .reduce((sum, c) => sum + c.totalFee, 0);

  // Hot Prospects
  const hotCustomers = customers.filter(c => c.analysis?.readiness === ReadinessLevel.HOT && c.status !== CustomerStatus.SIGNED);

  // Pending Contracts
  const pendingContracts = contracts.filter(c => c.status === ContractStatus.PENDING).length;

  // Persistency Rate (K2 Mock: Active / (Active + Lapsed))
  const activeCount = contracts.filter(c => c.status === ContractStatus.ACTIVE).length;
  const lapsedCount = contracts.filter(c => c.status === ContractStatus.LAPSED).length;
  const k2Rate = activeCount + lapsedCount > 0 ? Math.round((activeCount / (activeCount + lapsedCount)) * 100) : 100;

  // --- 2. SMART TASKS (ACTION CENTER) ---
  const smartTasks = useMemo(() => {
    const tasks: { 
        id: string; 
        type: 'urgent' | 'important' | 'normal'; 
        title: string; 
        subtitle: string; 
        icon: string; 
        color: string;
        customer?: Customer; // Link to customer for actions
        actionType?: 'payment' | 'birthday' | 'care'; // Context for message generation
        data?: any; // Extra data like contract info
    }[] = [];
    const today = new Date();

    // A. Urgent: Lapsed Contracts & Overdue Payments
    contracts.forEach(c => {
        const customer = customers.find(cus => cus.id === c.customerId);
        if (c.status === ContractStatus.LAPSED) {
            tasks.push({
                id: `lapsed-${c.id}`, type: 'urgent',
                title: `Khôi phục HĐ ${c.contractNumber}`,
                subtitle: 'Hợp đồng đã mất hiệu lực! Liên hệ ngay.',
                icon: 'fa-exclamation-triangle', color: 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400',
                customer: customer,
                actionType: 'care'
            });
        } else if (c.status === ContractStatus.ACTIVE) {
            const dueDate = new Date(c.nextPaymentDate);
            if (dueDate < today) {
                tasks.push({
                    id: `overdue-${c.id}`, type: 'urgent',
                    title: `Quá hạn đóng phí HĐ ${c.contractNumber}`,
                    subtitle: `Trễ hạn từ ngày ${formatDateVN(c.nextPaymentDate)}`,
                    icon: 'fa-clock', color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400',
                    customer: customer,
                    actionType: 'payment',
                    data: c
                });
            }
        }
    });

    // B. Important: Hot Customers not interacted recently
    hotCustomers.forEach(c => {
        tasks.push({
            id: `hot-${c.id}`, type: 'important',
            title: `Chốt nóng: ${c.fullName}`,
            subtitle: 'Khách hàng đang rất sẵn sàng (HOT)',
            icon: 'fa-fire', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/10 dark:text-orange-300',
            customer: c,
            actionType: 'care'
        });
    });

    // C. Normal: Today's Appointments & Birthdays (Next 3 days)
    appointments
        .filter(a => a.date === today.toISOString().split('T')[0] && a.status === AppointmentStatus.UPCOMING)
        .forEach(a => {
            const customer = customers.find(c => c.id === a.customerId);
            tasks.push({
                id: `appt-${a.id}`, type: 'normal',
                title: `${a.time}: ${a.type} - ${a.customerName}`,
                subtitle: a.note || 'Không có ghi chú',
                icon: 'fa-calendar-check', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400',
                customer: customer,
                actionType: a.type === AppointmentType.BIRTHDAY ? 'birthday' : 'care'
            });
        });

    customers.forEach(c => {
        const dob = new Date(c.dob);
        const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
        const diff = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 3600 * 24));
        
        if (diff >= 0 && diff <= 3) {
             tasks.push({
                id: `bday-${c.id}`, type: 'normal',
                title: `Sinh nhật ${c.fullName} ${diff === 0 ? 'hôm nay' : `trong ${diff} ngày tới`}`,
                subtitle: 'Gửi tin nhắn chúc mừng',
                icon: 'fa-birthday-cake', color: 'text-pink-500 bg-pink-100 dark:bg-pink-900/20 dark:text-pink-400',
                customer: c,
                actionType: 'birthday'
            });
        }
    });

    const priorityMap = { urgent: 0, important: 1, normal: 2 };
    return tasks.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  }, [customers, contracts, appointments, hotCustomers]);

  // --- 3. CHART DATA ---
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthStr = `T${d.getMonth() + 1}`;
        const revenue = contracts
            .filter(c => {
                const eff = new Date(c.effectiveDate);
                return eff.getMonth() === d.getMonth() && eff.getFullYear() === d.getFullYear() && c.status === ContractStatus.ACTIVE;
            })
            .reduce((sum, c) => sum + (c.totalFee / 1000000), 0);
        data.push({ name: monthStr, value: revenue });
    }
    return data;
  }, [contracts]);

  const handleTaskAction = (task: typeof smartTasks[0], action: 'call' | 'zalo') => {
    if (!task.customer) return;
    if (action === 'call') {
        window.location.href = `tel:${task.customer.phone}`;
    } else {
        let content = "Chào {name}, em nhắn tin để hỏi thăm tình hình sức khỏe của gia đình mình ạ.";
        const firstName = task.customer.fullName.split(' ').pop();
        const gender = task.customer.gender === 'Nam' ? 'anh' : task.customer.gender === 'Nữ' ? 'chị' : 'bạn';
        content = content.replace(/\{name\}/g, firstName || '').replace(/\{gender\}/g, gender);
        setActionModal({ isOpen: true, type: 'zalo', customer: task.customer, content: content });
    }
  };

  return (
    <div className="space-y-6 pb-10 transition-colors duration-300">
      
      {/* 1. MDRT PROGRESS BANNER */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 dark:from-black dark:to-gray-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden transition-all">
         <div className="absolute top-0 right-0 opacity-10 transform translate-x-10 -translate-y-10">
             <i className="fas fa-trophy text-9xl text-yellow-500"></i>
         </div>
         <div className="relative z-10">
             <div className="flex justify-between items-end mb-2">
                 <div>
                     <h2 className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
                         <i className="fas fa-medal"></i> Hành trình MDRT {currentYear}
                     </h2>
                     <p className="text-gray-400 text-sm mt-1">Mục tiêu: 1 Tỷ VNĐ FYP</p>
                 </div>
                 <div className="text-right">
                     <p className="text-3xl font-bold">{(currentFYP / 1000000).toFixed(0)} <span className="text-sm font-normal text-gray-400">triệu</span></p>
                     <p className="text-xs text-gray-400">Đạt {mdrtProgress.toFixed(1)}%</p>
                 </div>
             </div>
             <div className="w-full bg-gray-700 dark:bg-gray-800 rounded-full h-4 overflow-hidden border border-gray-600 dark:border-gray-700">
                 <div 
                    className="bg-gradient-to-r from-yellow-600 to-yellow-300 h-full rounded-full transition-all duration-1000 ease-out relative"
                    style={{ width: `${mdrtProgress}%` }}
                 >
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                 </div>
             </div>
         </div>
      </div>

      {/* 2. KEY METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Doanh số tháng" value={`${(revenueThisMonth / 1000000).toFixed(0)} Tr`} icon="fa-chart-line" color="text-green-600" bg="bg-green-50 dark:bg-green-900/10" />
          <MetricCard title="HĐ Pending" value={pendingContracts} icon="fa-file-signature" color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/10" />
          <MetricCard title="Khách HOT" value={hotCustomers.length} icon="fa-fire" color="text-orange-500" bg="bg-orange-50 dark:bg-orange-900/10" />
          <MetricCard title="Tỷ lệ duy trì" value={`${k2Rate}%`} icon="fa-shield-alt" color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/10" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-pru-card rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col min-h-[500px] transition-colors">
            <div className="flex border-b border-gray-100 dark:border-gray-800 px-6 pt-4">
                <button onClick={() => setActiveTab('tasks')} className={`pb-4 px-4 font-bold text-sm transition relative ${activeTab === 'tasks' ? 'text-pru-red' : 'text-gray-500'}`}>
                    <i className="fas fa-tasks mr-2"></i>Việc cần làm
                    {activeTab === 'tasks' && <span className="absolute bottom-0 left-0 w-full h-1 bg-pru-red rounded-t-full"></span>}
                </button>
                <button onClick={() => setActiveTab('pipeline')} className={`pb-4 px-4 font-bold text-sm transition relative ${activeTab === 'pipeline' ? 'text-pru-red' : 'text-gray-500'}`}>
                    <i className="fas fa-filter mr-2"></i>Phễu khách hàng
                    {activeTab === 'pipeline' && <span className="absolute bottom-0 left-0 w-full h-1 bg-pru-red rounded-t-full"></span>}
                </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
                {activeTab === 'tasks' ? (
                    <div className="space-y-3">
                        {smartTasks.length > 0 ? (
                            smartTasks.map(task => (
                                <div key={task.id} className="bg-white dark:bg-pru-dark/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${task.color.split(' ').pop() === 'bg-white' ? 'bg-gray-100 dark:bg-gray-800' : task.color.split(' ').pop()}`}>
                                        <i className={`fas ${task.icon}`}></i>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-100">{task.title}</h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{task.subtitle}</p>
                                    </div>
                                    {task.customer && (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleTaskAction(task, 'call')} className="w-8 h-8 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center shadow-sm"><i className="fas fa-phone-alt text-xs"></i></button>
                                            <button onClick={() => handleTaskAction(task, 'zalo')} className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center shadow-sm"><i className="fas fa-comment-alt text-xs"></i></button>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-center py-10 text-gray-400">Không có việc khẩn cấp.</p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-4 h-full">
                         {['Tiềm năng', 'Đang tư vấn', 'Đã tham gia'].map(title => (
                             <div key={title} className="bg-gray-50 dark:bg-pru-dark/30 rounded-xl p-3">
                                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</span>
                                 <div className="mt-3 space-y-2">
                                     {customers.filter(c => c.status.includes(title)).slice(0, 3).map(c => (
                                         <div key={c.id} className="bg-white dark:bg-pru-card p-2 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm text-xs dark:text-gray-300">{c.fullName}</div>
                                     ))}
                                 </div>
                             </div>
                         ))}
                    </div>
                )}
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-white dark:bg-pru-card rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 transition-colors">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4 text-sm">Doanh thu (Triệu)</h3>
                <div style={{ width: '100%', height: 200 }}> 
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{fontSize: '12px', borderRadius: '8px', border: 'none'}} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#ed1b2e' : '#cbd5e1'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{title: string, value: string | number, icon: string, color: string, bg: string}> = ({title, value, icon, color, bg}) => (
    <div className="bg-white dark:bg-pru-card p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-between transition-colors">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${bg} ${color}`}>
            <i className={`fas ${icon}`}></i>
        </div>
        <div>
            <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider">{title}</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-0.5">{value}</p>
        </div>
    </div>
);

export default Dashboard;