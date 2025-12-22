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
                icon: 'fa-exclamation-triangle', color: 'text-red-600 bg-red-100',
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
                    icon: 'fa-clock', color: 'text-orange-600 bg-orange-100',
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
            icon: 'fa-fire', color: 'text-orange-500 bg-orange-50',
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
                icon: 'fa-calendar-check', color: 'text-blue-600 bg-blue-100',
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
                icon: 'fa-birthday-cake', color: 'text-pink-500 bg-pink-100',
                customer: c,
                actionType: 'birthday'
            });
        }
    });

    // Sort: Urgent -> Important -> Normal
    const priorityMap = { urgent: 0, important: 1, normal: 2 };
    return tasks.sort((a, b) => priorityMap[a.type] - priorityMap[b.type]);

  }, [customers, contracts, appointments, hotCustomers]);

  // --- 3. AI OPPORTUNITIES (CROSS-SELL) ---
  const opportunities = useMemo(() => {
      const opps: {customer: string, product: string, reason: string}[] = [];
      
      customers.filter(c => c.status === CustomerStatus.SIGNED).forEach(c => {
          const cContracts = contracts.filter(cnt => cnt.customerId === c.id && cnt.status === ContractStatus.ACTIVE);
          
          // Check Health Rider
          const hasHealth = cContracts.some(cnt => cnt.riders.some(r => r.productName.toLowerCase().includes('sức khỏe')));
          if (!hasHealth) {
              opps.push({
                  customer: c.fullName,
                  product: 'Thẻ Sức Khỏe',
                  reason: 'Khách đã có HĐ Nhân thọ nhưng chưa có Thẻ y tế.'
              });
          }

          // Check Education for Kids
          if ((c.analysis?.childrenCount || 0) > 0) {
              const hasEdu = cContracts.some(cnt => cnt.mainProduct.productName.toLowerCase().includes('trưởng thành') || cnt.mainProduct.productName.toLowerCase().includes('học vấn'));
              if (!hasEdu) {
                   opps.push({
                      customer: c.fullName,
                      product: 'Quỹ Học Vấn',
                      reason: `Khách có ${c.analysis?.childrenCount} con nhưng chưa có gói tích lũy cho con.`
                  });
              }
          }
      });
      return opps.slice(0, 5); // Limit to top 5
  }, [customers, contracts]);

  // --- 4. CHART DATA ---
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
            .reduce((sum, c) => sum + (c.totalFee / 1000000), 0); // Convert to Million
        data.push({ name: monthStr, value: revenue });
    }
    return data;
  }, [contracts]);

  // --- ACTIONS HANDLER ---
  const handleTaskAction = (task: typeof smartTasks[0], action: 'call' | 'zalo') => {
    if (!task.customer) return alert("Không tìm thấy thông tin khách hàng");

    if (action === 'call') {
        window.location.href = `tel:${task.customer.phone}`;
    } else {
        // GENERATE MESSAGE CONTENT
        let content = '';
        
        if (task.actionType === 'birthday') {
            const template = messageTemplates.find(t => t.category === 'birthday') || {
                content: "Chúc mừng sinh nhật {name}! Chúc {gender} tuổi mới thật nhiều sức khỏe, hạnh phúc và thành công. Prudential và em luôn đồng hành cùng gia đình mình!"
            };
            content = template.content;
        } else if (task.actionType === 'payment' && task.data) {
             const template = messageTemplates.find(t => t.category === 'payment') || {
                content: "Chào {name}, hợp đồng Prudential số {contract} của {gender} sắp đến hạn đóng phí ngày {date}. Số tiền là {fee}. {gender} lưu ý giúp em nhé!"
            };
            content = template.content;
        } else {
             content = "Chào {name}, chúc {gender} một ngày tốt lành! Em nhắn tin để hỏi thăm tình hình sức khỏe của gia đình mình ạ.";
        }

        // Replace Placeholders
        const firstName = task.customer.fullName.split(' ').pop();
        const gender = task.customer.gender === 'Nam' ? 'anh' : task.customer.gender === 'Nữ' ? 'chị' : 'bạn';
        
        content = content.replace(/\{name\}/g, firstName || '')
                         .replace(/\{gender\}/g, gender)
                         .replace(/\{contract\}/g, task.data?.contractNumber || '...')
                         .replace(/\{date\}/g, task.data ? formatDateVN(task.data.nextPaymentDate) : '...')
                         .replace(/\{fee\}/g, task.data ? (task.data.totalFee.toLocaleString() + 'đ') : '...');

        setActionModal({
            isOpen: true,
            type: 'zalo',
            customer: task.customer,
            content: content
        });
    }
  };

  return (
    <div className="space-y-6 pb-10">
      
      {/* 1. MDRT PROGRESS BANNER */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
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
             {/* Progress Bar */}
             <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden border border-gray-600">
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
          <MetricCard 
            title="Doanh số tháng này" 
            value={`${(revenueThisMonth / 1000000).toFixed(0)} Tr`} 
            icon="fa-chart-line" 
            color="text-green-600" 
            bg="bg-green-50"
            trend="+15% so với tháng trước"
          />
          <MetricCard 
            title="Hồ sơ chờ phát hành" 
            value={pendingContracts} 
            icon="fa-file-signature" 
            color="text-blue-600" 
            bg="bg-blue-50"
            subLabel="Hợp đồng Pending"
          />
          <MetricCard 
            title="Khách hàng HOT" 
            value={hotCustomers.length} 
            icon="fa-fire" 
            color="text-orange-500" 
            bg="bg-orange-50"
            subLabel="Cần chốt ngay"
          />
          <MetricCard 
            title="Tỷ lệ duy trì (K2)" 
            value={`${k2Rate}%`} 
            icon="fa-shield-alt" 
            color={k2Rate >= 85 ? "text-purple-600" : "text-red-500"} 
            bg={k2Rate >= 85 ? "bg-purple-50" : "bg-red-50"}
            subLabel="Chỉ số chất lượng"
          />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 3. MAIN COMMAND CENTER (Left) */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[500px]">
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6 pt-4">
                <button 
                    onClick={() => setActiveTab('tasks')}
                    className={`pb-4 px-4 font-bold text-sm transition relative ${activeTab === 'tasks' ? 'text-pru-red' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <i className="fas fa-tasks mr-2"></i>Việc cần làm
                    {activeTab === 'tasks' && <span className="absolute bottom-0 left-0 w-full h-1 bg-pru-red rounded-t-full"></span>}
                </button>
                <button 
                    onClick={() => setActiveTab('pipeline')}
                    className={`pb-4 px-4 font-bold text-sm transition relative ${activeTab === 'pipeline' ? 'text-pru-red' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <i className="fas fa-filter mr-2"></i>Phễu khách hàng
                    {activeTab === 'pipeline' && <span className="absolute bottom-0 left-0 w-full h-1 bg-pru-red rounded-t-full"></span>}
                </button>
            </div>

            {/* Content */}
            <div className="p-6 flex-1 overflow-y-auto bg-gray-50/50">
                {activeTab === 'tasks' ? (
                    <div className="space-y-3">
                        {smartTasks.length > 0 ? (
                            smartTasks.map(task => (
                                <div key={task.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition group">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${task.color}`}>
                                        <i className={`fas ${task.icon}`}></i>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className={`font-bold text-sm ${task.type === 'urgent' ? 'text-red-600' : 'text-gray-800'}`}>
                                                {task.type === 'urgent' && <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded mr-2">GẤP</span>}
                                                {task.title}
                                            </h4>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{task.subtitle}</p>
                                    </div>
                                    
                                    {/* ACTION BUTTONS */}
                                    {task.customer && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleTaskAction(task, 'call')}
                                                className="w-9 h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-500 hover:text-white transition shadow-sm"
                                                title="Gọi điện"
                                            >
                                                <i className="fas fa-phone-alt text-xs"></i>
                                            </button>
                                            <button 
                                                onClick={() => handleTaskAction(task, 'zalo')}
                                                className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-500 hover:text-white transition shadow-sm"
                                                title="Nhắn tin Zalo"
                                            >
                                                <i className="fas fa-comment-alt text-xs"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <i className="fas fa-check-circle text-4xl mb-3 text-green-100"></i>
                                <p>Tuyệt vời! Bạn đã hoàn thành hết việc hôm nay.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                        <PipelineColumn 
                            title="Tiềm năng (Cold)" 
                            count={customers.filter(c => c.status === CustomerStatus.POTENTIAL).length} 
                            color="bg-blue-500"
                            items={customers.filter(c => c.status === CustomerStatus.POTENTIAL).slice(0, 5)}
                        />
                        <PipelineColumn 
                            title="Đang tư vấn (Warm)" 
                            count={customers.filter(c => c.status === CustomerStatus.ADVISING).length} 
                            color="bg-yellow-500"
                            items={customers.filter(c => c.status === CustomerStatus.ADVISING).slice(0, 5)}
                        />
                         <PipelineColumn 
                            title="Đã chốt (Signed)" 
                            count={customers.filter(c => c.status === CustomerStatus.SIGNED).length} 
                            color="bg-green-500"
                            items={customers.filter(c => c.status === CustomerStatus.SIGNED).slice(0, 5)}
                        />
                    </div>
                )}
            </div>
        </div>

        {/* 4. INSIGHTS & ANALYTICS (Right) */}
        <div className="space-y-6">
            
            {/* AI Opportunities */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center">
                        <i className="fas fa-lightbulb text-yellow-400 mr-2"></i>Gợi ý Bán hàng (AI)
                    </h3>
                </div>
                {opportunities.length > 0 ? (
                    <div className="space-y-3">
                        {opportunities.map((opp, idx) => (
                            <div key={idx} className="bg-gradient-to-br from-purple-50 to-white p-3 rounded-xl border border-purple-100">
                                <div className="flex justify-between items-start">
                                    <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded mb-1">{opp.product}</span>
                                    <button className="text-gray-300 hover:text-purple-600"><i className="fas fa-comment-dots"></i></button>
                                </div>
                                <p className="text-sm font-bold text-gray-800">{opp.customer}</p>
                                <p className="text-xs text-gray-500 mt-1 italic">"{opp.reason}"</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400 text-center py-4">Chưa có gợi ý mới.</p>
                )}
            </div>

            {/* Revenue Chart - FIXED CONTAINER SIZE */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-4 text-sm">Xu hướng doanh thu (Triệu VNĐ)</h3>
                <div style={{ width: '100%', height: 300 }}> 
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
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

      {/* 5. ACTION MODAL (Zalo Message) */}
      {actionModal.isOpen && actionModal.customer && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 animate-fade-in">
             <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                 <div className="text-center mb-4">
                     <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2 text-blue-600 text-xl">
                         <i className="fas fa-comment-alt"></i>
                     </div>
                     <h3 className="text-lg font-bold text-gray-800">Gửi tin nhắn Zalo</h3>
                     <p className="text-sm text-gray-500">Đến: {actionModal.customer.fullName}</p>
                 </div>
                 
                 <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                     <textarea 
                         className="w-full bg-transparent outline-none text-sm text-gray-700 resize-none h-32"
                         value={actionModal.content}
                         onChange={(e) => setActionModal(prev => ({...prev, content: e.target.value}))}
                     />
                 </div>

                 <div className="flex gap-3">
                     <button onClick={() => setActionModal({isOpen: false, type: 'call', customer: null})} className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Hủy</button>
                     <button 
                         onClick={() => {
                             navigator.clipboard.writeText(actionModal.content || '');
                             window.open(`https://zalo.me/${actionModal.customer?.phone}`, '_blank');
                             setActionModal({isOpen: false, type: 'call', customer: null});
                         }}
                         className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center justify-center"
                     >
                         <i className="fas fa-paper-plane mr-2"></i>Copy & Mở Zalo
                     </button>
                 </div>
             </div>
         </div>
      )}

    </div>
  );
};

// --- SUB-COMPONENTS ---

const MetricCard: React.FC<{title: string, value: string | number, icon: string, color: string, bg: string, subLabel?: string, trend?: string}> = ({title, value, icon, color, bg, subLabel, trend}) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
        <div className="flex justify-between items-start mb-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bg} ${color}`}>
                <i className={`fas ${icon} text-lg`}></i>
            </div>
            {trend && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold">{trend}</span>}
        </div>
        <div>
            <p className="text-gray-500 text-xs font-bold uppercase">{title}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
            {subLabel && <p className="text-xs text-gray-400 mt-1">{subLabel}</p>}
        </div>
    </div>
);

const PipelineColumn: React.FC<{title: string, count: number, color: string, items: Customer[]}> = ({title, count, color, items}) => (
    <div className="bg-gray-50 rounded-xl p-3 flex flex-col h-full">
        <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-gray-600 uppercase">{title}</span>
            <span className={`text-[10px] text-white px-2 py-0.5 rounded-full font-bold ${color}`}>{count}</span>
        </div>
        <div className="space-y-2 flex-1">
            {items.map(c => (
                <div key={c.id} className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm text-xs">
                    <div className="font-bold text-gray-800">{c.fullName}</div>
                    <div className="text-gray-500 mt-0.5">{c.analysis?.readiness || 'N/A'}</div>
                </div>
            ))}
            {count > 5 && <div className="text-center text-[10px] text-gray-400 italic">Xem thêm {count - 5} khách...</div>}
        </div>
    </div>
);

export default Dashboard;