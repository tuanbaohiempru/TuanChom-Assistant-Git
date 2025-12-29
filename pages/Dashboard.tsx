
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppState, ContractStatus, AppointmentStatus, CustomerStatus, ReadinessLevel, Contract, Customer, AppointmentType } from '../types';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatDateVN } from '../components/Shared';

interface DashboardProps {
  state: AppState;
  onUpdateContract: (c: Contract) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ state }) => {
  const { customers, contracts, appointments, agentProfile } = state;
  const [activeTab, setActiveTab] = useState<'tasks' | 'pipeline'>('tasks');
  
  // Action Modal State
  const [actionModal, setActionModal] = useState<{isOpen: boolean, type: 'call' | 'zalo', customer: Customer | null, content?: string}>({
      isOpen: false, type: 'call', customer: null
  });

  // --- 1. GOAL & SALES TRACKING LOGIC ---
  const salesMetrics = useMemo(() => {
    const today = new Date();
    
    // Define Time Ranges
    const getWeekRange = () => {
        const first = today.getDate() - today.getDay() + 1; // Monday
        const last = first + 6; // Sunday
        return {
            start: new Date(today.setDate(first)).setHours(0,0,0,0),
            end: new Date(today.setDate(last)).setHours(23,59,59,999)
        };
    };
    
    const getMonthRange = () => ({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getTime()
    });

    const getQuarterRange = () => {
        const currQuarter = Math.floor(new Date().getMonth() / 3);
        return {
            start: new Date(new Date().getFullYear(), currQuarter * 3, 1).getTime(),
            end: new Date(new Date().getFullYear(), currQuarter * 3 + 3, 0).getTime()
        };
    };

    const getYearRange = () => ({
        start: new Date(new Date().getFullYear(), 0, 1).getTime(),
        end: new Date(new Date().getFullYear(), 11, 31).getTime()
    });

    const ranges = {
        week: getWeekRange(),
        month: getMonthRange(),
        quarter: getQuarterRange(),
        year: getYearRange()
    };

    // Calculate Actual Sales (Based on Total Fee of ACTIVE contracts within range)
    const calculateSales = (start: number, end: number) => {
        return contracts
            .filter(c => {
                const effDate = new Date(c.effectiveDate).getTime();
                return c.status === ContractStatus.ACTIVE && effDate >= start && effDate <= end;
            })
            .reduce((sum, c) => sum + c.totalFee, 0);
    };

    const actual = {
        week: calculateSales(ranges.week.start, ranges.week.end),
        month: calculateSales(ranges.month.start, ranges.month.end),
        quarter: calculateSales(ranges.quarter.start, ranges.quarter.end),
        year: calculateSales(ranges.year.start, ranges.year.end)
    };

    // Get Targets from Profile (Default to 0 if not set)
    const targets = agentProfile?.targets || { weekly: 0, monthly: 0, quarterly: 0, yearly: 0 };

    return { actual, targets };
  }, [contracts, agentProfile]);

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

    // B. Important: Hot Customers (Ready to close)
    const hotCustomers = customers.filter(c => c.analysis?.readiness === ReadinessLevel.HOT && c.status !== CustomerStatus.SIGNED);
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

  }, [customers, contracts, appointments]);

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
      
      {/* 1. SALES GOAL TRACKING (Replaces Old Metrics) */}
      <div className="flex justify-between items-end mb-2">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
              <i className="fas fa-crosshairs text-pru-red mr-2"></i> Mục tiêu & Doanh số
          </h2>
          <Link to="/settings" className="text-sm text-blue-500 hover:underline flex items-center">
              <i className="fas fa-cog mr-1"></i> Cài đặt mục tiêu
          </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GoalCard 
              title="Tuần này" 
              actual={salesMetrics.actual.week} 
              target={salesMetrics.targets.weekly} 
              icon="fa-calendar-week" 
              color="blue" 
          />
          <GoalCard 
              title="Tháng này" 
              actual={salesMetrics.actual.month} 
              target={salesMetrics.targets.monthly} 
              icon="fa-calendar-alt" 
              color="green" 
          />
          <GoalCard 
              title="Quý này" 
              actual={salesMetrics.actual.quarter} 
              target={salesMetrics.targets.quarterly} 
              icon="fa-chart-pie" 
              color="orange" 
          />
          <GoalCard 
              title="Năm nay" 
              actual={salesMetrics.actual.year} 
              target={salesMetrics.targets.yearly} 
              icon="fa-trophy" 
              color="red" 
          />
      </div>

      {/* 2. MAIN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COL: ACTION CENTER */}
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
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                <i className="fas fa-clipboard-check text-4xl mb-2 opacity-50"></i>
                                <p>Tuyệt vời! Bạn đã hoàn thành mọi việc.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-4 h-full">
                         {['Tiềm năng', 'Đang tư vấn', 'Đã tham gia'].map(title => (
                             <div key={title} className="bg-gray-50 dark:bg-pru-dark/30 rounded-xl p-3 flex flex-col">
                                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{title}</span>
                                 <div className="flex-1 space-y-2 overflow-y-auto max-h-[300px]">
                                     {customers.filter(c => c.status.includes(title)).map(c => (
                                         <div key={c.id} className="bg-white dark:bg-pru-card p-3 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm text-xs dark:text-gray-300">
                                             <div className="font-bold">{c.fullName}</div>
                                             {c.analysis?.readiness === ReadinessLevel.HOT && <div className="text-[10px] text-orange-500 font-bold mt-1"><i className="fas fa-fire"></i> HOT</div>}
                                         </div>
                                     ))}
                                     {customers.filter(c => c.status.includes(title)).length === 0 && (
                                         <p className="text-center text-xs text-gray-400 italic mt-4">Trống</p>
                                     )}
                                 </div>
                             </div>
                         ))}
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT COL: CHART */}
        <div className="space-y-6">
            <div className="bg-white dark:bg-pru-card rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 transition-colors">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4 text-sm">Biểu đồ Doanh thu (Triệu)</h3>
                <div style={{ width: '100%', height: 250 }}> 
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                            <Tooltip 
                                cursor={{fill: 'transparent'}} 
                                contentStyle={{fontSize: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#1e1e1e', color: '#fff'}} 
                            />
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

// --- HELPER COMPONENT FOR GOAL CARD ---
const GoalCard: React.FC<{title: string, actual: number, target: number, icon: string, color: string}> = ({title, actual, target, icon, color}) => {
    const progress = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
    // Format to nearest million integer (e.g. 27.35 -> 27)
    const formatMoney = (n: number) => Math.round(n / 1000000).toLocaleString('vi-VN'); 

    // Color Mapping
    const colorClasses: Record<string, string> = {
        blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-900/30',
        green: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-900/30',
        orange: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 border-orange-100 dark:border-orange-900/30',
        red: 'text-pru-red bg-red-50 dark:bg-red-900/20 dark:text-red-400 border-red-100 dark:border-red-900/30'
    };

    const barColors: Record<string, string> = {
        blue: 'bg-blue-500',
        green: 'bg-green-500',
        orange: 'bg-orange-500',
        red: 'bg-pru-red'
    };

    return (
        <div className="bg-white dark:bg-pru-card p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
            <div className="flex justify-between items-start mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${colorClasses[color]}`}>
                    <i className={`fas ${icon}`}></i>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{title}</p>
                    {target > 0 ? (
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                            Mục tiêu: {formatMoney(target)}
                        </p>
                    ) : (
                        <p className="text-[10px] text-gray-400 italic">Chưa đặt MT</p>
                    )}
                </div>
            </div>
            
            <div className="mb-2">
                <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">{formatMoney(actual)}</span>
                <span className="text-xs text-gray-500 ml-1">Tr</span>
            </div>

            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-1000 ${barColors[color]}`}
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
            <p className="text-right text-[10px] font-bold text-gray-400 mt-1">{progress.toFixed(0)}%</p>
        </div>
    );
};

export default Dashboard;
