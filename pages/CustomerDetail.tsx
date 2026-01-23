
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Customer, Contract, InteractionType, TimelineItem, ClaimRecord, ClaimStatus, CustomerDocument, Gender, MaritalStatus, FinancialRole, IncomeTrend, RiskTolerance, PersonalityType, RelationshipType, ContractStatus, IssuanceType } from '../types';
import { formatDateVN, CurrencyInput, SearchableCustomerSelect } from '../components/Shared';
import { uploadFile } from '../services/storage';
import { analyzeSocialInput, chatWithData } from '../services/geminiService'; // Import chatWithData for Magic Scan

interface CustomerDetailProps {
    customers: Customer[];
    contracts: Contract[];
    onUpdateCustomer: (c: Customer) => Promise<void>;
}

const CustomerDetail: React.FC<CustomerDetailProps> = ({ customers, contracts, onUpdateCustomer }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    
    // Find customer
    const customer = customers.find(c => c.id === id);
    const customerContracts = contracts.filter(c => c.customerId === id);

    // Calculate Financial Snapshot
    const totalPremiums = customerContracts.reduce((sum, c) => sum + c.totalFee, 0);
    const totalClaims = (customer?.claims || []).filter(c => c.status === ClaimStatus.APPROVED).reduce((sum, c) => sum + c.amountPaid, 0);

    // State
    const [activeTab, setActiveTab] = useState<'analysis' | 'timeline' | 'contracts' | 'claims' | 'docs' | 'info'>('analysis');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    // New Timeline State
    const [newInteraction, setNewInteraction] = useState<{type: InteractionType, content: string, title: string, date: string}>({
        type: InteractionType.NOTE, content: '', title: '', date: new Date().toISOString().split('T')[0]
    });
    const [timelineDeleteId, setTimelineDeleteId] = useState<string | null>(null);

    // New Claim State
    const [isAddingClaim, setIsAddingClaim] = useState(false);
    const [newClaim, setNewClaim] = useState<Partial<ClaimRecord>>({
        benefitType: 'Nằm viện', amountRequest: 0, status: ClaimStatus.PENDING, dateSubmitted: new Date().toISOString().split('T')[0]
    });

    // --- SOCIAL ENRICH MODAL STATE ---
    const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);
    
    // --- MAGIC SCAN STATE (PHASE 3) ---
    const [isMagicScanning, setIsMagicScanning] = useState(false);

    // --- GAP ANALYSIS ENGINE (THE BRAIN) ---
    const gapAnalysis = useMemo(() => {
        if (!customer) return null;

        const incomeMonthly = customer.analysis?.incomeMonthly || 0;
        const annualIncome = incomeMonthly * 12;

        // 1. PROTECTION FUND (Quỹ bảo vệ thu nhập) - Standard: 10 years income
        const targetProtection = Math.max(annualIncome * 10, 1000000000); // Min 1 billion if income unknown
        const currentProtection = customerContracts
            .filter(c => c.status === ContractStatus.ACTIVE)
            .reduce((sum, c) => sum + c.mainProduct.sumAssured, 0);
        const gapProtection = Math.max(0, targetProtection - currentProtection);
        const protectionProgress = Math.min(100, (currentProtection / targetProtection) * 100);

        // 2. CI FUND (Bệnh hiểm nghèo) - Standard: 3 years income or 30% lifetime income
        const targetCI = Math.max(annualIncome * 3, 500000000); // Min 500tr
        const currentCI = customerContracts
            .filter(c => c.status === ContractStatus.ACTIVE)
            .reduce((sum, c) => {
                // Heuristic: Check riders for CI keywords
                const ciRiders = c.riders.filter(r => 
                    r.productName.toLowerCase().includes('bệnh') || 
                    r.productName.toLowerCase().includes('hiểm nghèo') ||
                    r.productName.toLowerCase().includes('ci')
                );
                return sum + ciRiders.reduce((s, r) => s + r.sumAssured, 0);
            }, 0);
        const gapCI = Math.max(0, targetCI - currentCI);
        const ciProgress = Math.min(100, (currentCI / targetCI) * 100);

        // 3. HEALTH CARE (Thẻ sức khỏe)
        const hasHealthCard = customerContracts.some(c => 
            c.status === ContractStatus.ACTIVE && 
            c.riders.some(r => r.productName.toLowerCase().includes('sức khỏe') || r.productName.toLowerCase().includes('healthcare'))
        );

        return {
            targetProtection, currentProtection, gapProtection, protectionProgress,
            targetCI, currentCI, gapCI, ciProgress,
            hasHealthCard
        };
    }, [customer, customerContracts]);

    // --- UNIFIED TIMELINE LOGIC ---
    const virtualTimeline = useMemo(() => {
        if (!customer) return [];
        let events: TimelineItem[] = [];
        if (customer.timeline && customer.timeline.length > 0) events = [...customer.timeline];

        customerContracts.forEach(c => {
            events.push({
                id: `contract-start-${c.id}`, date: c.effectiveDate, type: InteractionType.CONTRACT,
                title: 'Tham gia Hợp đồng', content: `Ký HĐ số ${c.contractNumber}\nSản phẩm: ${c.mainProduct.productName}`, result: 'Active'
            });
            if (c.status === ContractStatus.LAPSED) {
                events.push({
                    id: `contract-lapsed-${c.id}`, date: c.nextPaymentDate, type: InteractionType.SYSTEM,
                    title: 'Hợp đồng Mất hiệu lực', content: `HĐ số ${c.contractNumber} đã quá hạn đóng phí.`, result: 'Warning'
                });
            }
        });

        if (customer.claims) {
            customer.claims.forEach(cl => {
                events.push({
                    id: `claim-event-${cl.id}`, date: cl.dateSubmitted, type: InteractionType.CLAIM,
                    title: `Nộp yêu cầu Bồi thường`, content: `Quyền lợi: ${cl.benefitType}\nSố tiền: ${cl.amountRequest.toLocaleString()} đ`, result: cl.status
                });
            });
        }
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [customer, customerContracts]);

    if (!customer) return <div className="p-10 text-center">Không tìm thấy khách hàng</div>;

    // --- HANDLERS ---
    const handleAddTimeline = async () => {
        if (!newInteraction.content) return alert("Vui lòng nhập nội dung");
        const chosenDate = new Date(newInteraction.date);
        const now = new Date();
        chosenDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

        const newItem: TimelineItem = {
            id: Date.now().toString(),
            date: chosenDate.toISOString(),
            type: newInteraction.type,
            title: newInteraction.title || newInteraction.type,
            content: newInteraction.content,
            result: ''
        };
        const updatedCustomer = { ...customer, timeline: [newItem, ...(customer.timeline || [])] };
        await onUpdateCustomer(updatedCustomer);
        setNewInteraction({type: InteractionType.NOTE, content: '', title: '', date: new Date().toISOString().split('T')[0]});
    };

    const handleDeleteTimelineItem = async () => {
        if (!timelineDeleteId || !customer.timeline) return;
        const updatedCustomer = { ...customer, timeline: customer.timeline.filter(item => item.id !== timelineDeleteId) };
        await onUpdateCustomer(updatedCustomer);
        setTimelineDeleteId(null);
    };

    const handleAddClaim = async () => {
        if (!newClaim.amountRequest) return alert("Vui lòng nhập số tiền yêu cầu");
        const item: ClaimRecord = {
            id: `claim_${Date.now()}`,
            dateSubmitted: newClaim.dateSubmitted || new Date().toISOString(),
            contractId: newClaim.contractId || '',
            benefitType: newClaim.benefitType || '',
            amountRequest: newClaim.amountRequest || 0,
            amountPaid: 0, status: ClaimStatus.PENDING, notes: newClaim.notes || '', documents: []
        };
        const updatedCustomer = { ...customer, claims: [item, ...(customer.claims || [])] };
        await onUpdateCustomer(updatedCustomer);
        setIsAddingClaim(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'medical' | 'personal') => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const url = await uploadFile(file, 'customer_docs');
            const newDoc: CustomerDocument = {
                id: Date.now().toString(), name: file.name, url: url, type: file.type.includes('image') ? 'image' : 'pdf', category: category, uploadDate: new Date().toISOString()
            };
            await onUpdateCustomer({ ...customer, documents: [...(customer.documents || []), newDoc] });
            alert("Đã tải tài liệu thành công!");
        } catch (err) { alert("Lỗi tải file"); }
    };

    const getTimelineIcon = (type: InteractionType) => {
        switch(type) {
            case InteractionType.CALL: return 'fa-phone-alt bg-blue-100 text-blue-600';
            case InteractionType.MEETING: return 'fa-users bg-purple-100 text-purple-600';
            case InteractionType.CLAIM: return 'fa-heartbeat bg-red-100 text-red-600 border-red-200';
            case InteractionType.CONTRACT: return 'fa-file-signature bg-green-100 text-green-600 border-green-200';
            case InteractionType.ZALO: return 'fa-comment-dots bg-blue-50 text-blue-500';
            case InteractionType.SYSTEM: return 'fa-exclamation-triangle bg-orange-100 text-orange-600';
            default: return 'fa-sticky-note bg-gray-100 text-gray-500';
        }
    };

    // --- PHASE 3: MAGIC SCAN HANDLER ---
    const handleMagicScan = async () => {
        setIsMagicScanning(true);
        try {
            // 1. Gather Context: Profile + Timeline Notes
            const historyText = customer.timeline
                .map(t => `[${t.date.substring(0, 10)}] ${t.type}: ${t.content}`)
                .join('\n');
            
            const prompt = `
            PHÂN TÍCH HỒ SƠ KHÁCH HÀNG (MAGIC SCAN):
            
            Dữ liệu hiện tại:
            - Tên: ${customer.fullName}
            - Nghề: ${customer.occupation}
            - Lịch sử tương tác:
            ${historyText}

            YÊU CẦU (Trả về JSON):
            Dựa trên các ghi chú trên, hãy suy luận và điền khuyết các thông tin sau. Nếu không có dữ liệu, hãy ước lượng dựa trên nghề nghiệp/độ tuổi (ghi chú là "Ước tính").
            
            Output JSON format:
            {
                "personality": "Chọn 1 trong: ${Object.values(PersonalityType).join(', ')}",
                "riskTolerance": "Chọn 1 trong: ${Object.values(RiskTolerance).join(', ')}",
                "biggestWorry": "Nỗi lo lớn nhất (ngắn gọn)",
                "futurePlans": "Kế hoạch tương lai (ngắn gọn)",
                "suggestedAction": "Hành động tiếp theo nên làm (1 câu)"
            }
            `;

            // Call AI (Router will verify this as EXPERT or ADMIN task)
            // We use chatWithData to leverage the existing router infrastructure, though direct call is fine too.
            // Using a direct call approach here for specific JSON output.
            
            // Re-using the prompt logic but forcing JSON structure via text request since 'chatWithData' returns string
            // We'll wrap this in a specialized call via 'processVoiceCommand' style or simpler direct call.
            // For simplicity in this file, we simulate the structure call using the Chat logic but asking for JSON.
            
            const aiResponse = await chatWithData(prompt, { customers: [customer], contracts: [], products: [], appointments: [], agentProfile: null, messageTemplates: [], illustrations: [] }, []);
            
            // Clean markdown json if any
            const jsonStr = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(jsonStr);

            if (result) {
                const updatedAnalysis = {
                    ...customer.analysis,
                    personality: result.personality || customer.analysis.personality,
                    riskTolerance: result.riskTolerance || customer.analysis.riskTolerance,
                    biggestWorry: result.biggestWorry || customer.analysis.biggestWorry,
                    futurePlans: result.futurePlans || customer.analysis.futurePlans
                };

                const newNote: TimelineItem = {
                    id: Date.now().toString(),
                    date: new Date().toISOString(),
                    type: InteractionType.SYSTEM,
                    title: '🔮 Magic Scan Insight',
                    content: `AI Phân tích:\n- Tính cách: ${result.personality}\n- Gợi ý: ${result.suggestedAction}`,
                    result: 'Done'
                };

                await onUpdateCustomer({
                    ...customer,
                    analysis: updatedAnalysis,
                    timeline: [newNote, ...(customer.timeline || [])]
                });
                alert("Magic Scan hoàn tất! Đã cập nhật Tháp tài chính và Hồ sơ.");
            }

        } catch (e) {
            console.error(e);
            alert("Lỗi Magic Scan: AI không trả về định dạng đúng hoặc mất kết nối.");
        } finally {
            setIsMagicScanning(false);
        }
    };

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            {/* HEADER: PROFILE & FINANCIAL SNAPSHOT */}
            <div className="bg-white dark:bg-pru-card rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-pru-red/10 to-transparent rounded-bl-full -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/customers')} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 transition">
                            <i className="fas fa-arrow-left text-gray-600 dark:text-gray-300"></i>
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">{customer.fullName}</h1>
                            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
                                <span><i className="fas fa-id-badge mr-1"></i> {customer.idCard || '---'}</span>
                                <span className="hidden md:inline">|</span>
                                <span><i className="fas fa-birthday-cake mr-1"></i> {formatDateVN(customer.dob)}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2 ${customer.status === 'Đã tham gia' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{customer.status}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto">
                        {/* MAGIC SCAN BUTTON (PHASE 3) */}
                        <button 
                            onClick={handleMagicScan}
                            disabled={isMagicScanning}
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white w-full md:w-auto px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition shadow-lg hover:shadow-purple-500/30 active:scale-95 disabled:opacity-70"
                        >
                            {isMagicScanning ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-magic mr-2"></i>}
                            {isMagicScanning ? 'Đang quét...' : 'Magic Scan'}
                        </button>

                        <button 
                            onClick={() => setIsEditModalOpen(true)}
                            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 w-10 h-10 md:w-auto md:px-4 md:py-2 rounded-xl text-sm font-bold flex items-center justify-center transition"
                        >
                            <i className="fas fa-pen md:mr-2"></i> <span className="hidden md:inline">Sửa hồ sơ</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* NAVIGATION TABS */}
            <div className="flex overflow-x-auto gap-2 border-b border-gray-200 dark:border-gray-800 pb-1 scrollbar-hide">
                {[
                    {id: 'analysis', label: 'Tháp tài chính', icon: 'fa-chart-pie'},
                    {id: 'timeline', label: 'Dòng thời gian', icon: 'fa-history'},
                    {id: 'contracts', label: 'Hợp đồng', icon: 'fa-file-contract'},
                    {id: 'claims', label: 'Bồi thường', icon: 'fa-heartbeat'},
                    {id: 'docs', label: 'Hồ sơ', icon: 'fa-folder-open'},
                    {id: 'info', label: 'Thông tin 360', icon: 'fa-user'}
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-3 rounded-t-xl text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-pru-card text-pru-red border-b-2 border-pru-red shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        <i className={`fas ${tab.icon} ${activeTab === tab.id ? 'text-pru-red' : 'text-gray-400'}`}></i> {tab.label}
                    </button>
                ))}
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LEFT CONTENT (Based on Tab) */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* TAB: FINANCIAL ANALYSIS (GAP) */}
                    {activeTab === 'analysis' && gapAnalysis && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Insight AI Card */}
                            {customer.analysis.personality && (
                                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
                                    <h4 className="text-purple-800 dark:text-purple-300 font-bold text-xs uppercase mb-2 flex items-center">
                                        <i className="fas fa-brain mr-2"></i> AI Insight
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block">Nhóm tính cách (DISC)</span>
                                            <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">{customer.analysis.personality}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block">Khẩu vị rủi ro</span>
                                            <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">{customer.analysis.riskTolerance}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block">Nỗi lo lớn nhất</span>
                                            <span className="font-bold text-red-600 dark:text-red-400 text-sm italic">"{customer.analysis.biggestWorry || 'Chưa xác định'}"</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Protection Card */}
                            <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center text-lg">
                                            <i className="fas fa-shield-alt text-blue-500 mr-2"></i> Bảo vệ Thu nhập (Trụ cột)
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Chuẩn MDRT: 10 năm thu nhập</p>
                                    </div>
                                    <div className={`px-3 py-1 rounded-lg text-xs font-bold ${gapAnalysis.gapProtection > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {gapAnalysis.gapProtection > 0 ? 'CẢNH BÁO: THIẾU HỤT' : 'AN TOÀN'}
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-gray-500">Đã có: {(gapAnalysis.currentProtection / 1e9).toFixed(1) + ' Tỷ' || '0'}</span>
                                        <span className="text-gray-800 dark:text-gray-200">Mục tiêu: {(gapAnalysis.targetProtection / 1e9).toFixed(1)} Tỷ</span>
                                    </div>
                                    <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${gapAnalysis.protectionProgress < 50 ? 'bg-red-500' : gapAnalysis.protectionProgress < 80 ? 'bg-orange-500' : 'bg-green-500'}`} 
                                            style={{width: `${gapAnalysis.protectionProgress}%`}}
                                        ></div>
                                    </div>
                                </div>

                                {gapAnalysis.gapProtection > 0 ? (
                                    <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/30">
                                        <div>
                                            <p className="text-xs font-bold text-red-600 uppercase">Thiếu hụt (Gap)</p>
                                            <p className="text-2xl font-black text-red-700 dark:text-red-400">{gapAnalysis.gapProtection.toLocaleString()} <span className="text-sm font-medium text-red-500">VNĐ</span></p>
                                        </div>
                                        <button 
                                            onClick={() => navigate('/product-advisory', { state: { customerId: customer.id, suggestedSA: gapAnalysis.gapProtection, goal: 'Lấp đầy quỹ dự phòng tài chính' } })}
                                            className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 shadow-lg shadow-red-500/30 transition flex items-center animate-pulse"
                                        >
                                            <i className="fas fa-magic mr-2"></i> Thiết kế giải pháp
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-800 text-center">
                                        <i className="fas fa-check-circle text-2xl text-green-500 mb-2"></i>
                                        <p className="text-sm font-bold text-green-700 dark:text-green-300">Khách hàng đã được bảo vệ tối ưu!</p>
                                    </div>
                                )}
                            </div>

                            {/* Critical Illness & Health Card */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center">
                                            <i className="fas fa-procedures text-purple-500 mr-2"></i> Bệnh hiểm nghèo
                                        </h3>
                                        <span className="text-xs text-gray-400">Chuẩn: 3 năm TN</span>
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center items-center mb-4">
                                        <div className="relative w-24 h-24">
                                            <svg className="w-full h-full" viewBox="0 0 36 36">
                                                <path className="text-gray-100 dark:text-gray-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                                <path className={`${gapAnalysis.ciProgress < 100 ? 'text-purple-500' : 'text-green-500'}`} strokeDasharray={`${gapAnalysis.ciProgress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                            </svg>
                                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                                                <span className="text-xs font-bold block text-gray-500">Đã có</span>
                                                <span className="text-sm font-black text-purple-600">{Math.round(gapAnalysis.ciProgress)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                    {gapAnalysis.gapCI > 0 && (
                                        <button 
                                            onClick={() => navigate('/product-advisory', { state: { customerId: customer.id, suggestedSA: gapAnalysis.gapCI, goal: 'Quỹ dự phòng Bệnh hiểm nghèo' } })}
                                            className="w-full py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-lg border border-purple-100 hover:bg-purple-100 transition"
                                        >
                                            + Bổ sung {gapAnalysis.gapCI > 1e9 ? (gapAnalysis.gapCI/1e9).toFixed(1) + ' tỷ' : (gapAnalysis.gapCI/1e6).toFixed(0) + ' tr'}
                                        </button>
                                    )}
                                </div>

                                <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center">
                                            <i className="fas fa-first-aid text-green-500 mr-2"></i> Thẻ sức khỏe
                                        </h3>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                                        {gapAnalysis.hasHealthCard ? (
                                            <>
                                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-2xl mb-2"><i className="fas fa-check"></i></div>
                                                <p className="text-sm font-bold text-green-700">Đã sở hữu</p>
                                                <p className="text-xs text-gray-500">An tâm điều trị</p>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400 text-2xl mb-2"><i className="fas fa-times"></i></div>
                                                <p className="text-sm font-bold text-gray-600 dark:text-gray-300">Chưa có thẻ</p>
                                                <p className="text-xs text-gray-500 mb-3">Rủi ro viện phí cao</p>
                                                <button 
                                                    onClick={() => navigate('/product-advisory', { state: { customerId: customer.id, goal: 'Thẻ chăm sóc sức khỏe toàn diện' } })}
                                                    className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 shadow-md"
                                                >
                                                    Tư vấn ngay
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: TIMELINE */}
                    {activeTab === 'timeline' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            {/* Add Interaction Input */}
                            <div className="mb-8 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                        {Object.values(InteractionType).filter(t => t !== InteractionType.SYSTEM).map(t => (
                                            <button 
                                                key={t}
                                                onClick={() => setNewInteraction({...newInteraction, type: t})}
                                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${newInteraction.type === t ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="flex flex-col md:flex-row gap-3">
                                    <input 
                                        type="date"
                                        className="w-full md:w-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-pru-red/20 text-gray-600 dark:text-gray-300"
                                        value={newInteraction.date}
                                        onChange={e => setNewInteraction({...newInteraction, date: e.target.value})}
                                    />
                                    <input 
                                        className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-pru-red/20"
                                        placeholder={`Ghi chú cho ${newInteraction.type}...`}
                                        value={newInteraction.content}
                                        onChange={e => setNewInteraction({...newInteraction, content: e.target.value})}
                                        onKeyDown={e => e.key === 'Enter' && handleAddTimeline()}
                                    />
                                    <button onClick={handleAddTimeline} className="w-12 h-12 bg-pru-red text-white rounded-xl shadow-md hover:bg-red-700 transition flex items-center justify-center flex-shrink-0">
                                        <i className="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Timeline List */}
                            <div className="space-y-0 relative">
                                <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                                {virtualTimeline.length > 0 ? (
                                    virtualTimeline.map((item, idx) => {
                                        const isManualItem = customer.timeline?.some(t => t.id === item.id);
                                        return (
                                            <div key={idx} className="relative pl-16 pb-8 last:pb-0 group">
                                                <div className={`absolute left-2 w-9 h-9 rounded-full border-4 border-white dark:border-pru-card flex items-center justify-center shadow-sm z-10 ${getTimelineIcon(item.type)}`}>
                                                    <i className={`fas ${item.type === InteractionType.CALL ? 'fa-phone' : item.type === InteractionType.CLAIM ? 'fa-heartbeat' : item.type === InteractionType.CONTRACT ? 'fa-file-signature' : item.type === InteractionType.SYSTEM ? 'fa-exclamation' : 'fa-sticky-note'} text-xs`}></i>
                                                </div>
                                                <div className="bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:shadow-md transition relative">
                                                    {isManualItem && (
                                                        <button onClick={() => setTimelineDeleteId(item.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/20" title="Xóa tương tác này">
                                                            <i className="fas fa-trash-alt text-xs"></i>
                                                        </button>
                                                    )}
                                                    <div className="flex justify-between items-start mb-2 pr-6">
                                                        <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">{formatDateVN(item.date)} • {item.type}</span>
                                                        {item.result && <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${item.type === InteractionType.SYSTEM ? 'bg-red-100 text-red-700' : item.type === InteractionType.CONTRACT ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{item.result}</span>}
                                                    </div>
                                                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">{item.title}</h4>
                                                    <p className="text-gray-600 dark:text-gray-400 text-sm whitespace-pre-wrap leading-relaxed">{item.content}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-10 text-gray-400 italic">Chưa có lịch sử tương tác nào.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ... (Existing Contracts, Claims, Docs, Info Tabs remain unchanged) ... */}
                    {activeTab === 'contracts' && (
                        <div className="grid grid-cols-1 gap-4">
                            {customerContracts.map(c => {
                                const isConditional = c.issuanceType === IssuanceType.CONDITIONAL;
                                return (
                                <div key={c.id} className={`bg-white dark:bg-pru-card p-5 rounded-xl border ${isConditional ? 'border-orange-200 dark:border-orange-800' : 'border-gray-100 dark:border-gray-800'} shadow-sm hover:shadow-md transition`}>
                                    <div className="flex justify-between items-start mb-4 border-b border-gray-100 dark:border-gray-800 pb-3">
                                        <div><h3 className="font-bold text-lg text-pru-red">{c.contractNumber}</h3><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.mainProduct.productName}</p></div>
                                        <div className="text-right"><p className="text-sm font-bold text-gray-600 dark:text-gray-400">{c.status}</p><p className="text-xs text-gray-400">Hiệu lực: {formatDateVN(c.effectiveDate)}</p></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm"><span className="text-gray-500">Người được BH:</span><span className="font-medium text-gray-800 dark:text-gray-200">{c.mainProduct.insuredName}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-gray-500">Mệnh giá bảo vệ:</span><span className="font-bold text-blue-600">{c.mainProduct.sumAssured.toLocaleString()} đ</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-gray-500">Phí đóng ({c.paymentFrequency}):</span><span className="font-bold text-gray-800 dark:text-gray-200">{c.totalFee.toLocaleString()} đ</span></div>
                                    </div>
                                    {isConditional && (
                                        <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-800">
                                            <div className="flex items-center gap-2 mb-1"><i className="fas fa-exclamation-triangle text-orange-600"></i><span className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase">Thư thỏa thuận áp dụng</span></div>
                                            {c.loadingFee ? <p className="text-xs text-gray-700 dark:text-gray-300">• Phí tăng: <span className="font-bold">{c.loadingFee.toLocaleString()} đ</span></p> : null}
                                            {c.exclusionNote && <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">• <span className="font-medium">Nội dung loại trừ:</span> {c.exclusionNote}</p>}
                                            {c.decisionLetterUrl && <a href={c.decisionLetterUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline mt-2 inline-block"><i className="fas fa-paperclip mr-1"></i>Xem thư quyết định</a>}
                                        </div>
                                    )}
                                    {c.riders.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
                                            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Sản phẩm bổ trợ ({c.riders.length})</p>
                                            <div className="space-y-1">{c.riders.map((r, i) => (<div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-300"><span>• {r.productName}</span><span>{r.attributes?.plan || r.sumAssured.toLocaleString()}</span></div>))}</div>
                                        </div>
                                    )}
                                </div>
                            )})}
                            {customerContracts.length === 0 && <div className="p-10 text-center text-gray-400 bg-white dark:bg-pru-card rounded-xl">Chưa có hợp đồng nào.</div>}
                        </div>
                    )}

                    {/* TAB: CLAIMS */}
                    {activeTab === 'claims' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100">Lịch sử Bồi thường (Claims)</h3>
                                <button onClick={() => setIsAddingClaim(true)} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 shadow-md"><i className="fas fa-plus mr-1"></i> Tạo yêu cầu</button>
                            </div>
                            
                            {isAddingClaim && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-100 animate-fade-in">
                                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300 mb-3">Nhập thông tin Claim mới</h4>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <select className="input-field text-sm" value={newClaim.contractId} onChange={(e) => setNewClaim({...newClaim, contractId: e.target.value})}>
                                            <option value="">-- Chọn HĐ --</option>
                                            {customerContracts.map(c => <option key={c.id} value={c.id}>{c.contractNumber} - {c.mainProduct.productName}</option>)}
                                        </select>
                                        <select className="input-field text-sm" value={newClaim.benefitType} onChange={(e) => setNewClaim({...newClaim, benefitType: e.target.value})}>
                                            <option>Nằm viện / Phẫu thuật</option><option>Tai nạn</option><option>Bệnh hiểm nghèo</option><option>Tử vong / TTTBVV</option>
                                        </select>
                                        <CurrencyInput className="input-field text-sm" placeholder="Số tiền yêu cầu" value={newClaim.amountRequest || 0} onChange={v => setNewClaim({...newClaim, amountRequest: v})} />
                                        <input type="date" className="input-field text-sm" value={newClaim.dateSubmitted} onChange={(e) => setNewClaim({...newClaim, dateSubmitted: e.target.value})} />
                                    </div>
                                    <textarea className="input-field text-sm w-full mb-3" rows={2} placeholder="Ghi chú thêm..." value={newClaim.notes} onChange={(e) => setNewClaim({...newClaim, notes: e.target.value})} />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setIsAddingClaim(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-lg">Hủy</button>
                                        <button onClick={handleAddClaim} className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg shadow-sm">Lưu</button>
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold border-b border-gray-100 dark:border-gray-700">
                                        <tr><th className="px-4 py-3">Ngày nộp</th><th className="px-4 py-3">Loại quyền lợi</th><th className="px-4 py-3">Số tiền YC</th><th className="px-4 py-3">Trạng thái</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {customer.claims && customer.claims.length > 0 ? (
                                            customer.claims.map((claim, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateVN(claim.dateSubmitted)}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{claim.benefitType}</td>
                                                    <td className="px-4 py-3 font-bold text-pru-red">{claim.amountRequest.toLocaleString()} đ</td>
                                                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold ${claim.status === ClaimStatus.APPROVED ? 'bg-green-100 text-green-700' : claim.status === ClaimStatus.REJECTED ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{claim.status}</span></td>
                                                </tr>
                                            ))
                                        ) : (<tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">Chưa có hồ sơ bồi thường nào.</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB: DOCS */}
                    {activeTab === 'docs' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Hồ sơ Y khoa & Giấy tờ</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition">
                                    <i className="fas fa-file-medical text-2xl text-blue-400 mb-2"></i><span className="text-xs font-bold text-gray-500 text-center">Upload Hồ sơ bệnh án</span>
                                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'medical')} accept="image/*,.pdf" />
                                </label>
                                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition">
                                    <i className="fas fa-id-card text-2xl text-green-400 mb-2"></i><span className="text-xs font-bold text-gray-500 text-center">Upload CCCD/Khai sinh</span>
                                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'personal')} accept="image/*,.pdf" />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {customer.documents && customer.documents.map((doc, idx) => (
                                    <a key={idx} href={doc.url} target="_blank" rel="noreferrer" className="group relative block bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-md transition">
                                        <div className="h-24 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-4xl text-gray-400"><i className={`fas ${doc.type === 'image' ? 'fa-image' : 'fa-file-pdf'}`}></i></div>
                                        <div className="p-2"><p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{doc.name}</p><p className="text-[10px] text-gray-500 uppercase">{doc.category === 'medical' ? 'Hồ sơ Y khoa' : 'Giấy tờ cá nhân'}</p></div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB: INFO */}
                    {activeTab === 'info' && (
                        <div className="bg-white dark:bg-pru-card rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center"><i className="fas fa-id-card mr-2 text-pru-red"></i>Thông tin cá nhân</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="flex justify-between"><span className="text-gray-500">Điện thoại</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.phone}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">CCCD/CMND</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.idCard || '--'}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Ngày sinh</span><span className="font-medium text-gray-800 dark:text-gray-200">{formatDateVN(customer.dob)}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Giới tính</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.gender}</span></div>
                                    <div className="flex justify-between md:col-span-2"><span className="text-gray-500 w-32">Địa chỉ</span><span className="font-medium text-gray-800 dark:text-gray-200 text-right">{customer.companyAddress}</span></div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center"><i className="fas fa-chart-pie mr-2 text-blue-500"></i>Nhân khẩu & Tài chính</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="flex justify-between"><span className="text-gray-500">Nghề nghiệp</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.occupation}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Hôn nhân</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.maritalStatus}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Vai trò tài chính</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.financialRole}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Người phụ thuộc</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.dependents} người</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Thu nhập (Tháng)</span><span className="font-bold text-green-600">{customer.analysis?.incomeMonthly?.toLocaleString()} đ</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Chi tiêu (Tháng)</span><span className="font-bold text-orange-600">{customer.analysis?.monthlyExpenses?.toLocaleString()} đ</span></div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center"><i className="fas fa-heartbeat mr-2 text-red-500"></i>Sức khỏe & Lối sống</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="flex justify-between"><span className="text-gray-500">Chiều cao</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.health?.height} cm</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Cân nặng</span><span className="font-medium text-gray-800 dark:text-gray-200">{customer.health?.weight} kg</span></div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm"><p className="text-gray-500 text-xs uppercase font-bold mb-1">Tiền sử bệnh</p><p className="text-gray-800 dark:text-gray-200 font-medium">{customer.health?.medicalHistory || 'Chưa ghi nhận'}</p></div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm"><p className="text-gray-500 text-xs uppercase font-bold mb-1">Thói quen sinh hoạt</p><p className="text-gray-800 dark:text-gray-200 font-medium">{customer.health?.habits || 'Chưa ghi nhận'}</p></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT SIDEBAR: QUICK ACTIONS & FAMILY */}
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="bg-white dark:bg-pru-card rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                        <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Thao tác nhanh</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => window.open(`tel:${customer.phone}`)} className="flex flex-col items-center justify-center p-3 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition"><i className="fas fa-phone-alt text-xl mb-1"></i> <span className="text-xs font-bold">Gọi điện</span></button>
                            <button className="flex flex-col items-center justify-center p-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition"><i className="fas fa-comment-alt text-xl mb-1"></i> <span className="text-xs font-bold">Nhắn Zalo</span></button>
                            <button onClick={() => navigate(`/advisory/${customer.id}`)} className="flex flex-col items-center justify-center p-3 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition col-span-2"><i className="fas fa-robot text-xl mb-1"></i> <span className="text-xs font-bold">Chat với AI (Roleplay)</span></button>
                        </div>
                    </div>

                    {/* Family */}
                    <div className="bg-white dark:bg-pru-card rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                        <h3 className="font-bold text-sm text-gray-500 uppercase mb-3">Gia đình & Mối quan hệ</h3>
                        {customer.relationships && customer.relationships.length > 0 ? (
                            <div className="space-y-3">
                                {customer.relationships.map((rel, idx) => {
                                    const relative = customers.find(c => c.id === rel.relatedCustomerId);
                                    if (!relative) return null;
                                    return (
                                        <div key={idx} onClick={() => navigate(`/customers/${relative.id}`)} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer transition">
                                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xs">{relative.fullName.charAt(0)}</div>
                                            <div><p className="text-sm font-bold text-gray-800 dark:text-gray-200">{relative.fullName}</p><p className="text-[10px] text-gray-500 uppercase">{rel.relationship}</p></div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (<p className="text-xs text-gray-400 italic">Chưa có thông tin gia đình.</p>)}
                    </div>
                </div>
            </div>

            {/* Timeline Delete Confirmation Modal */}
            {timelineDeleteId && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-fade-in backdrop-blur-sm">
                    <div className="bg-white dark:bg-pru-card rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                        <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-xl"><i className="fas fa-trash-alt"></i></div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Xóa tương tác này?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Bạn có chắc chắn muốn xóa ghi chú này khỏi dòng thời gian không?</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setTimelineDeleteId(null)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold">Hủy</button>
                            <button onClick={handleDeleteTimelineItem} className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/30">Xóa</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT PROFILE MODAL */}
            {isEditModalOpen && (
                <EditCustomerModal customer={customer} allCustomers={customers} onSave={async (updated) => { await onUpdateCustomer(updated); setIsEditModalOpen(false); }} onClose={() => setIsEditModalOpen(false)} />
            )}

            {/* SOCIAL ENRICH MODAL */}
            {isEnrichModalOpen && (
                <SocialEnrichModal 
                    customer={customer} 
                    onClose={() => setIsEnrichModalOpen(false)} 
                    onUpdate={onUpdateCustomer} 
                />
            )}
            
            <style>{`
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.5rem; border-radius: 0.5rem; outline: none; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .animate-fade-in { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

// --- NEW COMPONENT: SOCIAL ENRICH MODAL (MOBILE FIRST) ---
const SocialEnrichModal: React.FC<{
    customer: Customer;
    onClose: () => void;
    onUpdate: (c: Customer) => Promise<void>;
}> = ({ customer, onClose, onUpdate }) => {
    const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
    const [textInput, setTextInput] = useState('');
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<any | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                // Strip prefix
                const base64Content = base64String.split(',')[1];
                setImageBase64(base64Content);
                setMimeType(file.type);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAnalyze = async () => {
        if (inputMode === 'text' && !textInput) return alert("Vui lòng nhập nội dung!");
        if (inputMode === 'image' && !imageBase64) return alert("Vui lòng chọn ảnh!");

        setIsAnalyzing(true);
        try {
            const aiResult = await analyzeSocialInput(
                { text: textInput, imageBase64: imageBase64 || undefined, mimeType: mimeType || undefined },
                customer.fullName
            );
            setResult(aiResult);
        } catch (e) {
            alert("Lỗi phân tích: " + e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApply = async () => {
        if (!result) return;
        
        // 1. Update Profile Fields if suggested
        const updatedCustomer = { ...customer };
        let hasProfileUpdate = false;

        if (result.suggestedUpdates) {
            if (result.suggestedUpdates.job) { updatedCustomer.job = result.suggestedUpdates.job; hasProfileUpdate = true; }
            if (result.suggestedUpdates.companyAddress) { updatedCustomer.companyAddress = result.suggestedUpdates.companyAddress; hasProfileUpdate = true; }
            if (result.suggestedUpdates.maritalStatus) { updatedCustomer.maritalStatus = result.suggestedUpdates.maritalStatus; hasProfileUpdate = true; }
            if (result.suggestedUpdates.dependents) { updatedCustomer.dependents = result.suggestedUpdates.dependents; hasProfileUpdate = true; }
        }

        // 2. Add to Timeline
        const newTimelineItem: TimelineItem = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            type: InteractionType.NOTE,
            title: `Phát hiện: ${result.lifeEvent || 'Insight mới'}`,
            content: `Chi tiết: ${result.details}\nCảm xúc: ${result.sentiment}\n${result.riskFlag ? `⚠️ Rủi ro: ${result.riskFlag}` : ''}`,
            result: 'AI Detected'
        };
        updatedCustomer.timeline = [newTimelineItem, ...(updatedCustomer.timeline || [])];

        await onUpdate(updatedCustomer);
        alert(`Đã cập nhật hồ sơ và lưu sự kiện "${result.lifeEvent}"!`);
        onClose();
    };

    const handleCopyMessage = () => {
        if (result?.messageDraft) {
            navigator.clipboard.writeText(result.messageDraft);
            alert("Đã sao chép tin nhắn mẫu!");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150] p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-pru-card rounded-2xl w-full max-w-md p-0 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100 dark:border-gray-700">
                {/* Header Gradient */}
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 text-white flex justify-between items-center">
                    <h3 className="text-lg font-bold flex items-center"><i className="fas fa-magic mr-2"></i> Magic Scan</h3>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-2"><i className="fas fa-times text-xl"></i></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {!result ? (
                        <div className="space-y-6">
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setInputMode('text')} 
                                    className={`flex-1 py-4 rounded-xl font-bold transition flex flex-col items-center gap-2 ${inputMode === 'text' ? 'bg-purple-50 text-purple-700 border-2 border-purple-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}
                                >
                                    <i className="fas fa-pen-alt text-2xl"></i> Nhập Text
                                </button>
                                <button 
                                    onClick={() => setInputMode('image')} 
                                    className={`flex-1 py-4 rounded-xl font-bold transition flex flex-col items-center gap-2 ${inputMode === 'image' ? 'bg-purple-50 text-purple-700 border-2 border-purple-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}
                                >
                                    <i className="fas fa-image text-2xl"></i> Screenshot
                                </button>
                            </div>

                            {inputMode === 'text' ? (
                                <textarea 
                                    className="w-full h-32 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none text-base"
                                    placeholder="Copy status Facebook/Zalo của khách hàng vào đây..."
                                    value={textInput}
                                    onChange={e => setTextInput(e.target.value)}
                                />
                            ) : (
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition cursor-pointer relative bg-gray-50">
                                    <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                                    {imageBase64 ? (
                                        <div className="flex flex-col items-center">
                                            <i className="fas fa-check-circle text-green-500 text-4xl mb-2"></i>
                                            <p className="text-sm font-bold text-gray-700">Đã chọn ảnh</p>
                                            <p className="text-xs text-gray-500">Nhấn Phân tích để tiếp tục</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <i className="fas fa-cloud-upload-alt text-gray-400 text-4xl mb-2"></i>
                                            <p className="text-sm font-bold text-gray-600">Chạm để tải ảnh lên</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button 
                                onClick={handleAnalyze} 
                                disabled={isAnalyzing}
                                className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold hover:bg-purple-700 transition shadow-lg flex items-center justify-center text-lg active:scale-95"
                            >
                                {isAnalyzing ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-search mr-2"></i>}
                                {isAnalyzing ? 'Đang Phân Tích...' : 'Phân Tích Ngay'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-5 animate-slide-up">
                            {/* Result Card */}
                            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 shadow-sm">
                                <h4 className="text-purple-800 font-bold uppercase text-xs tracking-wide mb-2 flex items-center">
                                    <i className="fas fa-star mr-1 text-yellow-500"></i> Sự kiện mới
                                </h4>
                                <div>
                                    <h3 className="font-bold text-gray-800 text-xl mb-1">{result.lifeEvent}</h3>
                                    <p className="text-sm text-gray-600 mb-2">{result.details}</p>
                                    <div className="flex gap-2 flex-wrap">
                                        <span className="text-[10px] bg-white px-2 py-1 rounded border border-purple-200 font-bold text-purple-600">{result.date}</span>
                                        <span className="text-[10px] bg-white px-2 py-1 rounded border border-purple-200 font-bold text-blue-600">{result.sentiment}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Risk Flag */}
                            {result.riskFlag && (
                                <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex items-start gap-3">
                                    <div className="bg-red-100 p-2 rounded-full text-red-500"><i className="fas fa-exclamation-triangle"></i></div>
                                    <div>
                                        <p className="text-xs font-bold text-red-700 uppercase">Cảnh báo rủi ro</p>
                                        <p className="text-sm text-red-600 font-medium">{result.riskFlag}</p>
                                    </div>
                                </div>
                            )}

                            {/* Proposed Updates */}
                            {result.suggestedUpdates && Object.keys(result.suggestedUpdates).length > 0 && (
                                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                    <h4 className="text-gray-500 font-bold uppercase text-xs mb-3">Gợi ý cập nhật</h4>
                                    <div className="space-y-2">
                                        {Object.entries(result.suggestedUpdates).map(([key, val]: any) => (
                                            <div key={key} className="flex justify-between text-sm items-center border-b border-gray-200 last:border-0 pb-1 last:pb-0">
                                                <span className="text-gray-500 capitalize">{key}:</span>
                                                <span className="font-bold text-green-600">{val} <i className="fas fa-check text-[10px] ml-1"></i></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Message Draft */}
                            <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm relative group">
                                <h4 className="text-blue-600 font-bold uppercase text-xs mb-2">Tin nhắn mẫu (Zalo)</h4>
                                <p className="text-sm text-gray-700 italic leading-relaxed">"{result.messageDraft}"</p>
                                <button onClick={handleCopyMessage} className="absolute top-2 right-2 text-blue-500 bg-blue-50 p-2 rounded-lg shadow-sm hover:bg-blue-100 transition active:scale-95">
                                    <i className="fas fa-copy"></i>
                                </button>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setResult(null)} className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 rounded-xl hover:bg-gray-200">Hủy</button>
                                <button onClick={handleApply} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg active:scale-95">Lưu & Cập nhật</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const EditCustomerModal: React.FC<{
    customer: Customer;
    allCustomers: Customer[];
    onSave: (c: Customer) => void;
    onClose: () => void;
}> = ({ customer, allCustomers, onSave, onClose }) => {
    const [data, setData] = useState<Customer>(customer);
    const [activeSection, setActiveSection] = useState<'personal' | 'health' | 'finance' | 'relations'>('personal');

    const handleSave = () => { onSave(data); alert("Đã cập nhật hồ sơ khách hàng thành công!"); };
    const addRelationship = () => { setData(prev => ({ ...prev, relationships: [...(prev.relationships || []), { relatedCustomerId: '', relationship: RelationshipType.OTHER }] })); };
    const updateRelationship = (index: number, field: string, value: string) => { const newRels = [...(data.relationships || [])]; newRels[index] = { ...newRels[index], [field]: value }; setData(prev => ({ ...prev, relationships: newRels })); };
    const removeRelationship = (index: number) => { const newRels = [...(data.relationships || [])]; newRels.splice(index, 1); setData(prev => ({ ...prev, relationships: newRels })); };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white dark:bg-pru-card rounded-xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Chỉnh sửa Hồ sơ Khách hàng</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fas fa-times text-xl"></i></button>
                </div>
                <div className="flex flex-1 overflow-hidden">
                    <div className="w-1/4 bg-gray-50 dark:bg-gray-900 border-r border-gray-100 dark:border-gray-700 p-2 overflow-y-auto">
                        <button onClick={() => setActiveSection('personal')} className={`w-full text-left p-3 rounded-lg text-sm font-bold mb-1 transition ${activeSection === 'personal' ? 'bg-white dark:bg-gray-800 text-pru-red shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}><i className="fas fa-id-card mr-2 w-5"></i> Cá nhân & Liên hệ</button>
                        <button onClick={() => setActiveSection('finance')} className={`w-full text-left p-3 rounded-lg text-sm font-bold mb-1 transition ${activeSection === 'finance' ? 'bg-white dark:bg-gray-800 text-pru-red shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}><i className="fas fa-chart-pie mr-2 w-5"></i> Tài chính & Phân tích</button>
                        <button onClick={() => setActiveSection('health')} className={`w-full text-left p-3 rounded-lg text-sm font-bold mb-1 transition ${activeSection === 'health' ? 'bg-white dark:bg-gray-800 text-pru-red shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}><i className="fas fa-heartbeat mr-2 w-5"></i> Sức khỏe & Lối sống</button>
                        <button onClick={() => setActiveSection('relations')} className={`w-full text-left p-3 rounded-lg text-sm font-bold mb-1 transition ${activeSection === 'relations' ? 'bg-white dark:bg-gray-800 text-pru-red shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}><i className="fas fa-users mr-2 w-5"></i> Gia đình & Quan hệ</button>
                    </div>
                    <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-pru-card">
                        {activeSection === 'personal' && (
                            <div className="space-y-4 animate-fade-in">
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">Định danh & Liên hệ</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="label-text">Họ và tên</label><input className="input-field" value={data.fullName} onChange={e => setData({...data, fullName: e.target.value})} /></div>
                                    <div><label className="label-text">Số điện thoại</label><input className="input-field" value={data.phone} onChange={e => setData({...data, phone: e.target.value})} /></div>
                                    <div><label className="label-text">Ngày sinh</label><input type="date" className="input-field" value={data.dob} onChange={e => setData({...data, dob: e.target.value})} /></div>
                                    <div><label className="label-text">Giới tính</label><select className="input-field" value={data.gender} onChange={(e: any) => setData({...data, gender: e.target.value})}>{Object.values(Gender).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">CCCD / CMND</label><input className="input-field" value={data.idCard} onChange={e => setData({...data, idCard: e.target.value})} /></div>
                                    <div><label className="label-text">Địa chỉ / Công ty</label><input className="input-field" value={data.companyAddress} onChange={e => setData({...data, companyAddress: e.target.value})} /></div>
                                </div>
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase mb-2 mt-6">Nhân khẩu học</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="label-text">Nghề nghiệp</label><input className="input-field" value={data.occupation} onChange={e => setData({...data, occupation: e.target.value})} /></div>
                                    <div><label className="label-text">Tình trạng hôn nhân</label><select className="input-field" value={data.maritalStatus} onChange={(e: any) => setData({...data, maritalStatus: e.target.value})}>{Object.values(MaritalStatus).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Số người phụ thuộc</label><input type="number" className="input-field" value={data.dependents} onChange={e => setData({...data, dependents: Number(e.target.value)})} /></div>
                                    <div><label className="label-text">Vai trò tài chính</label><select className="input-field" value={data.financialRole} onChange={(e: any) => setData({...data, financialRole: e.target.value})}>{Object.values(FinancialRole).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                </div>
                            </div>
                        )}
                        {activeSection === 'finance' && (
                            <div className="space-y-4 animate-fade-in">
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">Tình hình tài chính</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="label-text">Thu nhập hàng tháng</label><CurrencyInput className="input-field font-bold text-green-600" value={data.analysis.incomeMonthly} onChange={v => setData({...data, analysis: {...data.analysis, incomeMonthly: v}})} /></div>
                                    <div><label className="label-text">Chi tiêu hàng tháng</label><CurrencyInput className="input-field font-bold text-orange-600" value={data.analysis.monthlyExpenses} onChange={v => setData({...data, analysis: {...data.analysis, monthlyExpenses: v}})} /></div>
                                    <div><label className="label-text">Xu hướng thu nhập</label><select className="input-field" value={data.analysis.incomeTrend} onChange={(e: any) => setData({...data, analysis: {...data.analysis, incomeTrend: e.target.value}})}>{Object.values(IncomeTrend).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Thu nhập dự kiến (3 năm tới)</label><CurrencyInput className="input-field" value={data.analysis.projectedIncome3Years} onChange={v => setData({...data, analysis: {...data.analysis, projectedIncome3Years: v}})} /></div>
                                </div>
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase mb-2 mt-6">Phân tích tâm lý</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="label-text">Tính cách (DISC)</label><select className="input-field" value={data.analysis.personality} onChange={(e: any) => setData({...data, analysis: {...data.analysis, personality: e.target.value}})}>{Object.values(PersonalityType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div><label className="label-text">Khẩu vị rủi ro</label><select className="input-field" value={data.analysis.riskTolerance} onChange={(e: any) => setData({...data, analysis: {...data.analysis, riskTolerance: e.target.value}})}>{Object.values(RiskTolerance).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                    <div className="col-span-2"><label className="label-text">Mối lo lớn nhất</label><input className="input-field" value={data.analysis.biggestWorry} onChange={e => setData({...data, analysis: {...data.analysis, biggestWorry: e.target.value}})} placeholder="VD: Bệnh hiểm nghèo, thất nghiệp..." /></div>
                                    <div className="col-span-2"><label className="label-text">Kế hoạch tương lai</label><input className="input-field" value={data.analysis.futurePlans} onChange={e => setData({...data, analysis: {...data.analysis, futurePlans: e.target.value}})} placeholder="VD: Cho con du học, mua nhà..." /></div>
                                </div>
                            </div>
                        )}
                        {activeSection === 'health' && (
                            <div className="space-y-4 animate-fade-in">
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase mb-2">Chỉ số cơ thể</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="label-text">Chiều cao (cm)</label><input type="number" className="input-field" value={data.health.height} onChange={e => setData({...data, health: {...data.health, height: Number(e.target.value)}})} /></div>
                                    <div><label className="label-text">Cân nặng (kg)</label><input type="number" className="input-field" value={data.health.weight} onChange={e => setData({...data, health: {...data.health, weight: Number(e.target.value)}})} /></div>
                                </div>
                                <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase mb-2 mt-6">Thông tin y khoa</h4>
                                <div><label className="label-text">Tiền sử bệnh / Phẫu thuật</label><textarea className="input-field h-24" value={data.health.medicalHistory} onChange={e => setData({...data, health: {...data.health, medicalHistory: e.target.value}})} placeholder="Ghi rõ năm mắc bệnh, điều trị tại đâu..." /></div>
                                <div><label className="label-text">Thói quen sinh hoạt (Rượu bia, thuốc lá)</label><textarea className="input-field h-20" value={data.health.habits} onChange={e => setData({...data, health: {...data.health, habits: e.target.value}})} placeholder="VD: Hút thuốc 1 gói/ngày..." /></div>
                            </div>
                        )}
                        {activeSection === 'relations' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase">Danh sách người thân</h4>
                                    <button onClick={addRelationship} className="text-xs bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200">+ Thêm người</button>
                                </div>
                                <div className="space-y-3">
                                    {data.relationships?.map((rel, idx) => (
                                        <div key={idx} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex gap-3 items-center">
                                            <div className="flex-1"><label className="label-text text-[10px]">Người thân (Chọn từ DS)</label><SearchableCustomerSelect customers={allCustomers} value={allCustomers.find(c => c.id === rel.relatedCustomerId)?.fullName || ''} onChange={(c) => updateRelationship(idx, 'relatedCustomerId', c.id)} className="text-sm" /></div>
                                            <div className="w-1/3"><label className="label-text text-[10px]">Mối quan hệ</label><select className="input-field py-2 text-sm" value={rel.relationship} onChange={(e) => updateRelationship(idx, 'relationship', e.target.value)}>{Object.values(RelationshipType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                                            <button onClick={() => removeRelationship(idx)} className="mt-5 text-red-500 hover:bg-red-50 p-2 rounded"><i className="fas fa-trash"></i></button>
                                        </div>
                                    ))}
                                    {(!data.relationships || data.relationships.length === 0) && <p className="text-center text-gray-400 italic text-sm">Chưa có thông tin gia đình.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Hủy bỏ</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-pru-red text-white font-bold rounded-lg hover:bg-red-700 shadow-md">Lưu Hồ Sơ</button>
                </div>
            </div>
        </div>
    );
};

export default CustomerDetail;
