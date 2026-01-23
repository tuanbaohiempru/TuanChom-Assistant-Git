
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppState, ContractStatus, AppointmentStatus, CustomerStatus, ReadinessLevel, Contract, Customer, AppointmentType, InteractionType, TimelineItem, Appointment } from '../types';
import { formatDateVN } from '../components/Shared';
import { processVoiceCommand } from '../services/geminiService';

interface DashboardProps {
  state: AppState;
  onUpdateContract: (c: Contract) => void;
  onAddAppointment: (a: Appointment) => Promise<void>;
  onUpdateCustomer: (c: Customer) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ state, onAddAppointment, onUpdateCustomer }) => {
  const { customers, contracts, appointments, agentProfile } = state;
  const navigate = useNavigate();
  const location = useLocation(); // Listen for triggers from Layout
  
  // State for Expansion
  const [isRadarExpanded, setIsRadarExpanded] = useState(false);

  // Action Modal State (Quick Actions)
  const [actionModal, setActionModal] = useState<{isOpen: boolean, type: 'call' | 'zalo', customer: Customer | null, content?: string}>({
      isOpen: false, type: 'call', customer: null
  });

  // VOICE COMMAND STATE
  const [voiceModal, setVoiceModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceActions, setVoiceActions] = useState<any | null>(null);
  const recognitionRef = useRef<any>(null);

  // --- EFFECT: HANDLE EXTERNAL TRIGGERS (FROM MAGIC BUTTON) ---
  useEffect(() => {
      if (location.state) {
          if (location.state.triggerVoice) {
              window.history.replaceState({}, document.title);
              toggleVoiceRecording();
          } else if (location.state.triggerNote) {
              window.history.replaceState({}, document.title);
              // For Note, we just open Voice for now as it handles notes too, 
              // or we could build a separate Note modal. Let's reuse Voice for "Quick Note" via speech.
              toggleVoiceRecording(); 
          }
      }
  }, [location]);

  // --- VOICE LOGIC ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'vi-VN';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
             // Show interim?
          }
        }
        if(finalTranscript) setTranscript(prev => prev + ' ' + finalTranscript);
      };
      recognition.onerror = (e: any) => console.error("Mic Error:", e);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceRecording = () => {
      if(!recognitionRef.current) return alert("Trình duyệt không hỗ trợ.");
      if(isListening) {
          recognitionRef.current.stop();
          setVoiceModal(false);
          handleProcessVoice();
      } else {
          setTranscript('');
          setVoiceActions(null);
          setVoiceModal(true);
          recognitionRef.current.start();
      }
  };

  const handleProcessVoice = async () => {
      if(!transcript.trim()) return;
      setIsProcessingVoice(true);
      setVoiceModal(true); // Keep modal open to show processing/results
      try {
          const result = await processVoiceCommand(transcript, customers);
          setVoiceActions(result);
      } catch (e) {
          alert("Lỗi xử lý giọng nói: " + e);
      } finally {
          setIsProcessingVoice(false);
      }
  };

  const executeVoiceActions = async () => {
      if(!voiceActions || !voiceActions.matchCustomerId) return;
      const customer = customers.find(c => c.id === voiceActions.matchCustomerId);
      if(!customer) return alert("Không tìm thấy khách hàng trong hệ thống.");

      let successCount = 0;

      for (const action of voiceActions.actions) {
          if (action.type === 'appointment') {
              const newAppt: Appointment = {
                  id: '',
                  customerId: customer.id,
                  customerName: customer.fullName,
                  date: action.data.date,
                  time: action.data.time,
                  type: (action.data.apptType as AppointmentType) || AppointmentType.CONSULTATION,
                  status: AppointmentStatus.UPCOMING,
                  note: action.data.note || 'Tạo tự động qua giọng nói'
              };
              await onAddAppointment(newAppt);
              successCount++;
          } 
          else if (action.type === 'log') {
              const newItem: TimelineItem = {
                  id: Date.now().toString(),
                  date: new Date().toISOString(),
                  type: (action.data.interactionType as InteractionType) || InteractionType.NOTE,
                  title: action.data.title || 'Ghi chú nhanh',
                  content: action.data.content || transcript,
                  result: action.data.result || ''
              };
              const updated = {
                  ...customer,
                  timeline: [newItem, ...(customer.timeline || [])],
                  interactionHistory: [`${new Date().toLocaleDateString()}: ${newItem.title}`, ...(customer.interactionHistory || [])]
              };
              await onUpdateCustomer(updated);
              successCount++;
          }
          // Handle Info Updates if implemented later
      }
      
      alert(`Đã thực hiện ${successCount} hành động thành công!`);
      setVoiceModal(false);
      setTranscript('');
      setVoiceActions(null);
  };

  // --- CONTEXTUAL INTELLIGENCE LOGIC (THE BRAIN) ---
  const commandCenter = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // --- 1. GROWTH ENGINE (Doanh thu & Upsell) ---
    const growthTasks: any[] = [];
    
    // A. Lapsed Contracts (Khôi phục = Doanh thu ngay)
    contracts.filter(c => c.status === ContractStatus.LAPSED).forEach(c => {
        const cus = customers.find(x => x.id === c.customerId);
        growthTasks.push({
            id: `lapsed-${c.id}`,
            priority: 'high',
            title: `Khôi phục HĐ ${c.contractNumber}`,
            desc: `HĐ mất hiệu lực. Khách: ${cus?.fullName}`,
            actionLabel: 'Gọi khôi phục',
            actionIcon: 'fa-phone-alt',
            customer: cus,
            actionType: 'call'
        });
    });

    // B. Payments Due (Thu phí)
    contracts.filter(c => c.status === ContractStatus.ACTIVE).forEach(c => {
        const dueDate = new Date(c.nextPaymentDate);
        // Overdue or Due Today/Tomorrow/Next 3 days
        const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        if (diff <= 3 && diff >= -30) { // Show overdue up to 30 days and upcoming 3 days
            const cus = customers.find(x => x.id === c.customerId);
            growthTasks.push({
                id: `due-${c.id}`,
                priority: diff < 0 ? 'urgent' : 'high',
                title: `Thu phí: ${cus?.fullName}`,
                desc: `${c.totalFee.toLocaleString()}đ (${diff < 0 ? `Trễ ${Math.abs(diff)} ngày` : `Hạn: ${formatDateVN(c.nextPaymentDate)}`})`,
                actionLabel: 'Nhắc phí ngay',
                actionIcon: 'fa-comment-dollar',
                customer: cus,
                actionType: 'zalo_payment',
                meta: { fee: c.totalFee, date: c.nextPaymentDate }
            });
        }
    });

    // C. Hot Leads (Chốt đơn)
    customers.filter(c => c.analysis?.readiness === ReadinessLevel.HOT && c.status !== CustomerStatus.SIGNED).forEach(c => {
        growthTasks.push({
            id: `hot-${c.id}`,
            priority: 'high',
            title: `Cơ hội chốt: ${c.fullName}`,
            desc: 'Khách hàng đang nóng (Hot), cần chốt ngay.',
            actionLabel: 'Thiết kế & Chốt',
            actionIcon: 'fa-file-signature',
            customer: c,
            actionType: 'advisory'
        });
    });

    // --- 2. TRUST ENGINE (Uy tín & Quan hệ) ---
    const trustTasks: any[] = [];

    // A. Birthdays (Today only for Command Center priority)
    customers.forEach(c => {
        const dob = new Date(c.dob);
        if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
            trustTasks.push({
                id: `bday-${c.id}`,
                priority: 'medium',
                title: `Sinh nhật ${c.fullName}`,
                desc: 'Hôm nay là ngày sinh nhật khách hàng.',
                actionLabel: 'Gửi quà/Lời chúc',
                actionIcon: 'fa-gift',
                customer: c,
                actionType: 'zalo_bday'
            });
        }
    });

    // B. Care Appointments (Today)
    appointments.filter(a => {
        const d = new Date(a.date);
        return a.status === AppointmentStatus.UPCOMING && 
               d.getDate() === today.getDate() && 
               d.getMonth() === today.getMonth() &&
               d.getFullYear() === today.getFullYear() &&
               (a.type === AppointmentType.CARE_CALL || a.type === AppointmentType.PAPERWORK || a.type === AppointmentType.CONSULTATION);
    }).forEach(a => {
        const cus = customers.find(c => c.id === a.customerId);
        trustTasks.push({
            id: `care-${a.id}`,
            priority: 'medium',
            title: `${a.type}: ${a.customerName}`,
            desc: a.note || 'Theo lịch đã hẹn',
            actionLabel: 'Gọi ngay',
            actionIcon: 'fa-phone',
            customer: cus,
            actionType: 'call'
        });
    });

    // --- 3. MASTERY ENGINE (Kỹ năng & Kiến thức) ---
    const skillTasks: any[] = [];
    
    // A. Roleplay based on "Warm" customers (Preparation)
    const warmCustomer = customers.find(c => c.analysis?.readiness === ReadinessLevel.WARM);
    if (warmCustomer) {
        skillTasks.push({
            id: `skill-roleplay-${warmCustomer.id}`,
            priority: 'low',
            title: `Luyện xử lý từ chối`,
            desc: `Khách ${warmCustomer.fullName} đang phân vân.`,
            actionLabel: 'Roleplay với AI',
            actionIcon: 'fa-robot',
            customer: warmCustomer,
            actionType: 'roleplay'
        });
    } else {
        // Generic Skill Task
        skillTasks.push({
            id: `skill-generic`,
            priority: 'low',
            title: `Nâng cao kỹ năng`,
            desc: `Luyện tập kịch bản: "Tôi không có tiền"`,
            actionLabel: 'Luyện tập ngay',
            actionIcon: 'fa-dumbbell',
            actionType: 'roleplay_generic'
        });
    }

    // B. Market News / Product Update (Static Context)
    skillTasks.push({
        id: `skill-news`,
        priority: 'low',
        title: `Kiến thức sản phẩm`,
        desc: `Ôn lại quyền lợi thẻ HTVK (Nâng cao)`,
        actionLabel: 'Xem tài liệu',
        actionIcon: 'fa-book-open',
        actionType: 'read_news'
    });

    return {
        growth: growthTasks.slice(0, 3), // Max 3 items
        trust: trustTasks.slice(0, 3),
        skills: skillTasks.slice(0, 3)
    };
  }, [customers, contracts, appointments]);

  // --- FULL RADAR (Expanded List - 10 Days) ---
  const fullRadarTasks = useMemo(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      const next10Days = new Date(today);
      next10Days.setDate(today.getDate() + 10);

      return appointments
        .filter(a => {
            const d = new Date(a.date);
            return a.status === AppointmentStatus.UPCOMING && d >= today && d <= next10Days;
        })
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [appointments]);

  // --- ACTION HANDLER ---
  const executeAction = (task: any) => {
      if (task.actionType === 'call' && task.customer) {
          window.location.href = `tel:${task.customer.phone}`;
      } 
      else if (task.actionType === 'zalo_payment' && task.customer) {
          const shortName = task.customer.fullName.split(' ').pop();
          const content = `Chào ${shortName}, em nhắc nhẹ mình sắp đến hạn đóng phí bảo hiểm để duy trì quyền lợi bảo vệ ạ. Số tiền là: ${task.meta?.fee.toLocaleString()}đ. Cần hỗ trợ gì nhắn em nhé!`;
          setActionModal({ isOpen: true, type: 'zalo', customer: task.customer, content });
      } 
      else if (task.actionType === 'zalo_bday' && task.customer) {
          const shortName = task.customer.fullName.split(' ').pop();
          const content = `Chúc mừng sinh nhật ${shortName}! 🎂 Chúc ${shortName} tuổi mới thật nhiều sức khỏe, hạnh phúc và thành công rực rỡ!`;
          setActionModal({ isOpen: true, type: 'zalo', customer: task.customer, content });
      } 
      else if (task.actionType === 'advisory' && task.customer) {
          navigate(`/product-advisory`, { state: { customerId: task.customer.id } });
      } 
      else if (task.actionType === 'roleplay' && task.customer) {
          navigate(`/advisory/${task.customer.id}`);
      } 
      else if (task.actionType === 'roleplay_generic') {
          // Open AI Chat with a prompt
          alert("Hãy vào mục Khách hàng -> Chọn một khách hàng bất kỳ -> Bấm Roleplay để luyện tập.");
      }
      else if (task.actionType === 'read_news') {
          navigate('/products');
      }
  };

  return (
    <div className="space-y-8 pb-32 animate-fade-in max-w-7xl mx-auto">
      
      {/* 1. GREETING & CONTEXT HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <span className="text-3xl">👋</span> Chào {agentProfile?.fullName.split(' ').pop() || 'Bạn'},
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-lg">
                  Hôm nay chúng ta sẽ tập trung vào 3 trụ cột này để tiến gần hơn tới danh hiệu MDRT.
              </p>
          </div>
          <div className="text-right hidden md:block bg-white dark:bg-pru-card px-4 py-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="text-[10px] font-bold text-pru-red uppercase tracking-wider">Mục tiêu MDRT</p>
              <p className="text-xl font-black text-gray-800 dark:text-gray-100">{(agentProfile?.targets?.yearly || 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">VNĐ</span></p>
          </div>
      </div>

      {/* 2. CONTEXTUAL COMMAND CENTER (3 COLUMNS - STACKED ON MOBILE) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COL 1: GROWTH (TĂNG TRƯỞNG) */}
          <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center shadow-sm">
                      <i className="fas fa-chart-line text-sm"></i>
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-100 uppercase text-sm tracking-wide">Tăng trưởng</h3>
              </div>
              
              <div className="flex flex-col gap-3">
                {commandCenter.growth.length > 0 ? (
                    commandCenter.growth.map((task, idx) => (
                        <CommandCard key={idx} task={task} onClick={() => executeAction(task)} color="green" />
                    ))
                ) : (
                    <EmptyState message="Không có cơ hội nóng hôm nay." icon="fa-seedling" />
                )}
              </div>
          </div>

          {/* COL 2: TRUST (UY TÍN) */}
          <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shadow-sm">
                      <i className="fas fa-shield-alt text-sm"></i>
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-100 uppercase text-sm tracking-wide">Uy tín & Niềm tin</h3>
              </div>

              <div className="flex flex-col gap-3">
                {commandCenter.trust.length > 0 ? (
                    commandCenter.trust.map((task, idx) => (
                        <CommandCard key={idx} task={task} onClick={() => executeAction(task)} color="blue" />
                    ))
                ) : (
                    <EmptyState message="Hôm nay không có sinh nhật hay lịch chăm sóc." icon="fa-calendar-check" />
                )}
              </div>
          </div>

          {/* COL 3: MASTERY (KỸ NĂNG) */}
          <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center shadow-sm">
                      <i className="fas fa-brain text-sm"></i>
                  </div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-100 uppercase text-sm tracking-wide">Nâng cấp bản thân</h3>
              </div>

              <div className="flex flex-col gap-3">
                {commandCenter.skills.map((task, idx) => (
                    <CommandCard key={idx} task={task} onClick={() => executeAction(task)} color="purple" />
                ))}
              </div>
          </div>
      </div>

      {/* 3. RADAR EXPANSION (Collapsible) */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6 mt-8">
          <div className="flex justify-center">
            <button 
                onClick={() => setIsRadarExpanded(!isRadarExpanded)}
                className={`group flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all ${isRadarExpanded ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100' : 'bg-white dark:bg-gray-900 text-gray-500 hover:text-pru-red border border-gray-200 dark:border-gray-700 hover:border-pru-red'}`}
            >
                <i className={`fas ${isRadarExpanded ? 'fa-chevron-up' : 'fa-radar'} `}></i>
                {isRadarExpanded ? 'Thu gọn Radar' : 'Mở rộng Radar 10 ngày tới'}
            </button>
          </div>

          {isRadarExpanded && (
              <div className="mt-6 bg-white dark:bg-pru-card rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 animate-slide-up">
                  <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
                      <i className="fas fa-calendar-alt mr-2 text-gray-400"></i> Lịch trình sắp tới
                  </h3>
                  <div className="space-y-1">
                      {fullRadarTasks.map(task => (
                          <div key={task.id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition border-b border-gray-50 dark:border-gray-800 last:border-0 group cursor-default">
                              <div className="flex items-center gap-4">
                                  <div className="text-center w-14 bg-gray-100 dark:bg-gray-800 rounded-lg py-1">
                                      <p className="text-[10px] font-bold text-gray-500 uppercase">{formatDateVN(task.date).substring(0,5)}</p>
                                      <p className="text-sm font-black text-gray-800 dark:text-gray-200">{task.time}</p>
                                  </div>
                                  <div>
                                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200 group-hover:text-pru-red transition-colors">{task.customerName}</p>
                                      <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <i className="fas fa-tag text-[10px]"></i> {task.type} • {task.note}
                                      </p>
                                  </div>
                              </div>
                              <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${
                                  task.type === AppointmentType.FEE_REMINDER ? 'bg-orange-100 text-orange-700' : 
                                  task.type === AppointmentType.BIRTHDAY ? 'bg-pink-100 text-pink-700' :
                                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                  {task.type === AppointmentType.FEE_REMINDER ? 'Thu phí' : task.type}
                              </span>
                          </div>
                      ))}
                      {fullRadarTasks.length === 0 && <p className="text-center text-gray-400 italic text-sm py-4">Không có lịch trình nào trong 10 ngày tới.</p>}
                  </div>
              </div>
          )}
      </div>

      {/* 4. SMART ACTION MODAL (Zalo Copy) */}
      {actionModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white dark:bg-pru-card rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col h-auto max-h-[80vh]">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2">
                          <i className="fas fa-magic text-purple-500"></i> Gợi ý nội dung
                      </h3>
                      <button onClick={() => setActionModal({...actionModal, isOpen: false})} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto mb-4">
                    <p className="text-xs text-gray-500 mb-2 italic">Hệ thống đã soạn sẵn, bạn có thể chỉnh sửa trước khi gửi:</p>
                    <textarea 
                        className="w-full h-40 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pru-red/20 leading-relaxed font-sans"
                        value={actionModal.content}
                        onChange={(e) => setActionModal({...actionModal, content: e.target.value})}
                    />
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setActionModal({...actionModal, isOpen: false})} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-sm hover:bg-gray-200 transition">Đóng</button>
                      <button onClick={() => {
                          navigator.clipboard.writeText(actionModal.content || '');
                          if (actionModal.customer) {
                              const phone = actionModal.customer.phone.replace(/\D/g, '');
                              window.open(`https://zalo.me/${phone}`, '_blank');
                          }
                          setActionModal({...actionModal, isOpen: false});
                      }} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition flex items-center justify-center gap-2">
                          <i className="fas fa-copy"></i> Copy & Mở Zalo
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* 5. VOICE COMMAND BUTTON (REMOVED - MOVED TO GLOBAL LAYOUT FAB) */}
      {/* The separate FAB here is removed to avoid clutter as requested in "Simple UI". Voice is now accessed via the Global Magic Button in Layout */}

      {/* 6. VOICE ACTION MODAL (ENHANCED) */}
      {voiceModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-md animate-fade-in">
              <div className="bg-white dark:bg-pru-card rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
                  
                  {/* Header */}
                  <div className="text-center mb-6">
                      <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl transition-all ${isListening ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                          <i className={`fas ${isListening ? 'fa-microphone' : 'fa-check-circle'}`}></i>
                      </div>
                      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                          {isListening ? 'Đang lắng nghe...' : isProcessingVoice ? 'Đang phân tích...' : 'Kết quả xử lý'}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic px-4">
                          "{transcript || 'Hãy nói nội dung cuộc hẹn hoặc ghi chú...'}"
                      </p>
                  </div>

                  {/* Actions Review */}
                  {!isListening && !isProcessingVoice && voiceActions && (
                      <div className="flex-1 overflow-y-auto mb-6 space-y-4">
                          {/* INSIGHTS SECTION */}
                          {voiceActions.insights && (
                              <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 space-y-2">
                                  <h4 className="text-xs font-bold uppercase text-blue-700 dark:text-blue-300 flex items-center mb-2">
                                      <i className="fas fa-brain mr-2"></i> Phân tích thông minh
                                  </h4>
                                  
                                  {voiceActions.insights.sentiment && (
                                      <div className="flex gap-2 text-sm">
                                          <span className="font-bold text-gray-600 dark:text-gray-300">Cảm xúc:</span>
                                          <span className="text-gray-800 dark:text-gray-100">{voiceActions.insights.sentiment}</span>
                                      </div>
                                  )}
                                  
                                  {voiceActions.insights.life_event && (
                                      <div className="flex gap-2 text-sm bg-white dark:bg-gray-800 p-2 rounded-lg border border-blue-200 dark:border-blue-800">
                                          <span className="text-yellow-500"><i className="fas fa-star"></i></span>
                                          <span className="font-bold text-gray-800 dark:text-gray-100">Sự kiện: {voiceActions.insights.life_event}</span>
                                      </div>
                                  )}

                                  {voiceActions.insights.opportunity && (
                                      <div className="flex gap-2 text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded-lg border border-green-200 dark:border-green-800">
                                          <span className="text-green-600"><i className="fas fa-lightbulb"></i></span>
                                          <span className="font-bold text-green-800 dark:text-green-300">Cơ hội: {voiceActions.insights.opportunity}</span>
                                      </div>
                                  )}
                              </div>
                          )}

                          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                                  <i className="fas fa-user-tag text-blue-500"></i>
                                  <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">
                                      Khách hàng: {voiceActions.matchCustomerName || 'Không xác định'}
                                  </span>
                              </div>
                              
                              <div className="space-y-3">
                                  {voiceActions.actions?.map((action: any, idx: number) => (
                                      <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex gap-3">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${action.type === 'appointment' ? 'bg-green-500' : 'bg-purple-500'}`}>
                                              <i className={`fas ${action.type === 'appointment' ? 'fa-calendar-check' : 'fa-sticky-note'}`}></i>
                                          </div>
                                          <div>
                                              <p className="font-bold text-sm text-gray-800 dark:text-gray-200">
                                                  {action.type === 'appointment' ? 'Tạo Lịch Hẹn' : action.type === 'update_info' ? 'Cập Nhật Hồ Sơ' : 'Ghi Nhật Ký'}
                                              </p>
                                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                  {action.type === 'appointment' 
                                                      ? `${action.data.time} - ${formatDateVN(action.data.date)}: ${action.data.title}` 
                                                      : action.type === 'update_info'
                                                      ? `${action.data.field}: ${action.data.value} (${action.data.reason})`
                                                      : `${action.data.content}`}
                                              </p>
                                          </div>
                                      </div>
                                  ))}
                                  {(!voiceActions.actions || voiceActions.actions.length === 0) && (
                                      <p className="text-center text-gray-400 text-xs italic">Không tìm thấy hành động cụ thể.</p>
                                  )}
                              </div>
                          </div>
                      </div>
                  )}

                  {/* Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                      {isListening ? (
                          <button onClick={toggleVoiceRecording} className="col-span-2 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 shadow-lg animate-pulse">
                              Dừng & Xử lý
                          </button>
                      ) : (
                          <>
                              <button onClick={() => { setVoiceModal(false); setIsListening(false); }} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600">
                                  Hủy bỏ
                              </button>
                              {!isProcessingVoice && voiceActions?.matchCustomerId && (
                                  <button onClick={executeVoiceActions} className="bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg">
                                      Thực hiện ngay
                                  </button>
                              )}
                              {!isProcessingVoice && !voiceActions?.matchCustomerId && (
                                  <button onClick={toggleVoiceRecording} className="bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg">
                                      Thử lại
                                  </button>
                              )}
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

// --- SUB-COMPONENTS ---

const CommandCard: React.FC<{task: any, onClick: () => void, color: 'green' | 'blue' | 'purple'}> = ({task, onClick, color}) => {
    // Style configurations based on color prop
    const styles = {
        green: {
            border: 'border-l-4 border-l-green-500',
            bgIcon: 'bg-green-50 dark:bg-green-900/20 text-green-600',
            btn: 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40',
            urgent: 'bg-red-50 text-red-600 border border-red-100'
        },
        blue: {
            border: 'border-l-4 border-l-blue-500',
            bgIcon: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
            btn: 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40',
            urgent: ''
        },
        purple: {
            border: 'border-l-4 border-l-purple-500',
            bgIcon: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
            btn: 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40',
            urgent: ''
        }
    };

    const s = styles[color];
    const isUrgent = task.priority === 'urgent';

    return (
        <div className={`bg-white dark:bg-pru-card p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-all group ${s.border} flex flex-col h-full`}>
            <div className="flex-1">
                <div className="flex justify-between items-start">
                    <h4 className={`font-bold text-sm mb-1 line-clamp-1 ${isUrgent ? 'text-red-600' : 'text-gray-800 dark:text-gray-100'}`}>
                        {isUrgent && <i className="fas fa-exclamation-circle mr-1 animate-pulse"></i>}
                        {task.title}
                    </h4>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed mb-3">{task.desc}</p>
            </div>
            
            <button 
                onClick={onClick}
                className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center transition-colors gap-2 ${s.btn}`}
            >
                <i className={`fas ${task.actionIcon}`}></i> {task.actionLabel}
            </button>
        </div>
    );
};

const EmptyState: React.FC<{message: string, icon: string}> = ({message, icon}) => (
    <div className="bg-gray-50 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center h-full flex flex-col items-center justify-center">
        <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mb-2 shadow-sm text-gray-300">
            <i className={`fas ${icon}`}></i>
        </div>
        <p className="text-xs text-gray-400 font-medium">{message}</p>
    </div>
);

export default Dashboard;
