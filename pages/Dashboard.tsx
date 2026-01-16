
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
  const [activeTab, setActiveTab] = useState<'tasks' | 'pending'>('tasks');
  
  // --- NEW: Search & Filter State ---
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskFilterType, setTaskFilterType] = useState<string>('all');

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

  // --- 2. SMART TASKS (ACTION CENTER - Next 10 Days) ---
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
    
    // Normalize Dates
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const next10Days = new Date(today);
    next10Days.setDate(today.getDate() + 10);
    next10Days.setHours(23,59,59,999);

    // A. Urgent & Payments: Lapsed Contracts, Overdue & Upcoming Payments
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
            // Overdue (Urgent)
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
            // Upcoming in 10 days (Normal)
            else if (dueDate >= today && dueDate <= next10Days) {
                 const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                 tasks.push({
                    id: `due-${c.id}`, type: 'normal',
                    title: `Thu phí HĐ ${c.contractNumber}`,
                    subtitle: `Hạn đóng: ${formatDateVN(c.nextPaymentDate)} (Còn ${diff} ngày)`,
                    icon: 'fa-file-invoice-dollar', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400',
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

    // C. Normal: Appointments (Next 10 days)
    appointments
        .filter(a => {
            const d = new Date(a.date);
            return a.status === AppointmentStatus.UPCOMING && d >= today && d <= next10Days;
        })
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach(a => {
            const customer = customers.find(c => c.id === a.customerId);
            const isToday = a.date === today.toISOString().split('T')[0];
            const timeDisplay = isToday ? a.time : `${formatDateVN(a.date)} ${a.time}`;
            
            tasks.push({
                id: `appt-${a.id}`, type: 'normal',
                title: `${timeDisplay}: ${a.type} - ${a.customerName}`,
                subtitle: a.note || 'Không có ghi chú',
                icon: 'fa-calendar-check', color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400',
                customer: customer,
                actionType: a.type === AppointmentType.BIRTHDAY ? 'birthday' : 'care'
            });
        });

    // D. Birthdays (Next 10 days)
    customers.forEach(c => {
        const dob = new Date(c.dob);
        const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
        
        const diff = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 3600 * 24));
        
        if (diff >= 0 && diff <= 10) {
             const bdayStr = formatDateVN(nextBday.toISOString().split('T')[0]).substring(0, 5);
             tasks.push({
                id: `bday-${c.id}`, type: 'normal',
                title: `Sinh nhật ${c.fullName} ${diff === 0 ? 'hôm nay' : `(${bdayStr})`}`,
                subtitle: diff === 0 ? 'Gửi tin nhắn chúc mừng ngay!' : `Còn ${diff} ngày nữa`,
                icon: 'fa-birthday-cake', color: 'text-pink-500 bg-pink-100 dark:bg-pink-900/20 dark:text-pink-400',
                customer: c,
                actionType: 'birthday'
            });
        }
    });

    const priorityMap = { urgent: 0, important: 1, normal: 2 };
    return tasks.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  }, [customers, contracts, appointments]);

  // --- 2.5 PENDING APPOINTMENTS (ALL Unconfirmed with SEARCH & FILTER) ---
  const pendingAppointments = useMemo(() => {
      const now = new Date();
      now.setHours(0,0,0,0);

      // 1. Base Filter
      let filtered = appointments.filter(a => a.status === AppointmentStatus.UPCOMING);

      // 2. Search Text
      if (taskSearchTerm) {
          const lower = taskSearchTerm.toLowerCase();
          filtered = filtered.filter(a => 
              a.customerName.toLowerCase().includes(lower) || 
              (a.note && a.note.toLowerCase().includes(lower))
          );
      }

      // 3. Filter Type
      if (taskFilterType !== 'all') {
          filtered = filtered.filter(a => a.type === taskFilterType);
      }

      // 4. Sort Date ASC (Overdue first)
      return filtered.sort((a, b) => {
          const dateA = new Date(`${a.date}T${a.time}`);
          const dateB = new Date(`${b.date}T${b.time}`);
          return dateA.getTime() - dateB.getTime();
      });
  }, [appointments, taskSearchTerm, taskFilterType]);

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

  const getTaskIcon = (type: AppointmentType) => {
      switch (type) {
          case AppointmentType.CONSULTATION: return 'fa-comments';
          case AppointmentType.FEE_REMINDER: return 'fa-file-invoice-dollar';
          case AppointmentType.BIRTHDAY: return 'fa-birthday-cake';
          case AppointmentType.CARE_CALL: return 'fa-phone-alt';
          case AppointmentType.PAPERWORK: return 'fa-file-signature';
          default: return 'fa-calendar-check';
      }
  };

  return (
    <div className="space-y-6 pb-10 transition-colors duration-300">
      
      {/* 1. SALES GOAL TRACKING */}
      <div className="flex justify-between items-end mb-2">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
              <i className="fas fa-crosshairs text-pru-red mr-2"></i> Mục tiêu & Doanh số
          </h2>
          <Link to="/settings" className="text-sm text-blue-500 hover:underline flex items-center">
              <i className="fas fa-cog mr-1"></i> Cài đặt mục tiêu
          </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GoalCard title="Tuần này" actual={salesMetrics.actual.week} target={salesMetrics.targets.weekly} icon="fa-calendar-week" color="blue" />
          <GoalCard title="Tháng này" actual={salesMetrics.actual.month} target={salesMetrics.targets.monthly} icon="fa-calendar-alt" color="green" />
          <GoalCard title="Quý này" actual={salesMetrics.actual.quarter} target={salesMetrics.targets.quarterly} icon="fa-chart-pie" color="orange" />
          <GoalCard title="Năm nay" actual={salesMetrics.actual.year} target={salesMetrics.targets.yearly} icon="fa-trophy" color="red" />
      </div>

      {/* 2. MAIN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COL: ACTION CENTER */}
        <div className="lg:col-span-2 bg-white dark:bg-pru-card rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col min-h-[500px] transition-colors">
            {/* TABS */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 px-6 pt-4">
                <button onClick={() => setActiveTab('tasks')} className={`pb-4 px-4 font-bold text-sm transition relative ${activeTab === 'tasks' ? 'text-pru-red' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                    <i className="fas fa-tasks mr-2"></i>Việc cần làm (10 ngày tới)
                    {activeTab === 'tasks' && <span className="absolute bottom-0 left-0 w-full h-1 bg-pru-red rounded-t-full"></span>}
                </button>
                <button onClick={() => setActiveTab('pending')} className={`pb-4 px-4 font-bold text-sm transition relative ${activeTab === 'pending' ? 'text-pru-red' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                    <i className="fas fa-clock mr-2"></i>Chờ xử lý ({pendingAppointments.length})
                    {activeTab === 'pending' && <span className="absolute bottom-0 left-0 w-full h-1 bg-pru-red rounded-t-full"></span>}
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
                                <p>Tuyệt vời! Bạn đã hoàn thành mọi việc trong 10 ngày tới.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    // PENDING / ALL UPCOMING TAB WITH SEARCH & FILTER
                    <div className="space-y-4">
                        {/* SEARCH & FILTER CONTROLS */}
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                <input 
                                    className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-pru-red" 
                                    placeholder="Tìm tên hoặc ghi chú..." 
                                    value={taskSearchTerm}
                                    onChange={(e) => setTaskSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                <button onClick={() => setTaskFilterType('all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border ${taskFilterType === 'all' ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700'}`}>Tất cả</button>
                                {Object.values(AppointmentType).map(t => (
                                    <button key={t} onClick={() => setTaskFilterType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border ${taskFilterType === t ? 'bg-pru-red text-white border-pru-red' : 'bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700'}`}>{t}</button>
                                ))}
                            </div>
                        </div>

                        {/* LIST */}
                        <div className="space-y-3">
                            {pendingAppointments.length > 0 ? (
                                pendingAppointments.map(appt => {
                                    const now = new Date();
                                    const apptDate = new Date(`${appt.date}T${appt.time}`);
                                    const isOverdue = apptDate < now;

                                    return (
                                        <div key={appt.id} className={`p-4 rounded-xl border shadow-sm flex items-center gap-4 transition group ${isOverdue ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30' : 'bg-white border-gray-100 dark:bg-pru-dark/50 dark:border-gray-800'}`}>
                                            {/* Icon */}
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                                                <i className={`fas ${getTaskIcon(appt.type)}`}></i> 
                                            </div>
                                            
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <h4 className={`font-bold text-sm ${isOverdue ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
                                                        {appt.customerName}
                                                    </h4>
                                                    {isOverdue && <span className="text-[10px] font-bold bg-red-200 text-red-800 px-2 py-0.5 rounded shadow-sm">Quá hạn</span>}
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                                                    {appt.type} • {formatDateVN(appt.date)} lúc {appt.time}
                                                </p>
                                                {appt.note && <p className="text-xs text-gray-400 mt-1 italic line-clamp-1 border-l-2 border-gray-200 pl-2">{appt.note}</p>}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                {/* PASSING STATE: focusDate to automatically navigate calendar */}
                                                <Link 
                                                    to="/appointments" 
                                                    state={{ focusDate: appt.date }}
                                                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center justify-center hover:bg-pru-red hover:text-white transition"
                                                    title="Xem trên lịch"
                                                >
                                                    <i className="fas fa-calendar-alt text-xs"></i>
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                    <i className="fas fa-check-double text-3xl mb-2 opacity-50"></i>
                                    <p className="text-sm">Không tìm thấy công việc nào.</p>
                                </div>
                            )}
                        </div>
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
