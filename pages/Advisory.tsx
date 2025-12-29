
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Customer, AgentProfile, Contract, FinancialGoal, PlanResult, FinancialPlanRecord } from '../types';
import { CurrencyInput, cleanMarkdownForClipboard, formatDateVN } from '../components/Shared';
import { calculateRetirement, calculateProtection, calculateEducation } from '../services/financialCalculator';
import { consultantChat, getObjectionSuggestions, generateFinancialAdvice } from '../services/geminiService';
import DOMPurify from 'dompurify';

interface AdvisoryPageProps {
    customers: Customer[];
    contracts: Contract[];
    agentProfile: AgentProfile | null;
    onUpdateCustomer: (c: Customer) => Promise<void>;
}

const AdvisoryPage: React.FC<AdvisoryPageProps> = ({ customers, contracts, agentProfile, onUpdateCustomer }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const customer = customers.find(c => c.id === id);
    const customerContracts = contracts.filter(c => c.customerId === id);

    // --- MODE SWITCH ---
    const [mode, setMode] = useState<'chat' | 'plan'>('plan'); 

    // --- ROLEPLAY CONFIG ---
    const [roleplayMode, setRoleplayMode] = useState<'consultant' | 'customer'>('consultant');
    const [chatStyle, setChatStyle] = useState<'zalo' | 'formal'>('formal'); 

    // --- WIZARD STATE ---
    const [step, setStep] = useState(1);
    const [selectedGoal, setSelectedGoal] = useState<FinancialGoal | null>(null);
    
    // Survey Inputs
    const [surveyData, setSurveyData] = useState({
        // Common
        inflation: 4, 
        investRate: 6, 
        existingSavings: 0,
        
        // Retirement Specific
        retireAge: 60,
        lifeExpectancy: 80,
        desiredMonthlyIncome: 15000000, 
        hasSI: true, 
        salarySI: 10000000, 

        // Protection Specific
        annualIncome: 300000000, 
        supportYears: 10,
        loans: 0,

        // Education Specific
        childAge: 5,
        uniAge: 18,
        uniDuration: 4,
        currentTuition: 50000000 
    });

    // Calculation Result
    const [planResult, setPlanResult] = useState<PlanResult | null>(null);
    
    // AI Advice State
    const [aiAdvice, setAiAdvice] = useState<string>('');
    const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
    const [showExplanation, setShowExplanation] = useState(false); // Toggle explanation

    // What-if Slider State
    const [adjustedMonthlySaving, setAdjustedMonthlySaving] = useState(0);

    // --- CHAT ROLEPLAY STATE ---
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [suggestions, setSuggestions] = useState<{label: string, content: string, type: 'empathy'|'logic'|'story'}[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [quickReplies, setQuickReplies] = useState<string[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, mode, suggestions, quickReplies]);

    // --- HANDLERS ---

    const handleGoalSelect = (goal: FinancialGoal) => {
        setSelectedGoal(goal);
        let defaultInflation = 4;
        if (goal === FinancialGoal.EDUCATION) defaultInflation = 8; 
        if (goal === FinancialGoal.HEALTH) defaultInflation = 10; 

        setSurveyData(prev => ({ ...prev, inflation: defaultInflation }));
        setStep(2); 
        setPlanResult(null); 
    };

    const loadPlan = (plan: FinancialPlanRecord) => {
        setSelectedGoal(plan.goal);
        setSurveyData(plan.inputs);
        setPlanResult(plan.result);
        setAdjustedMonthlySaving(plan.result.monthlySavingNeeded || 0);
        setStep(3); 
    };

    const handleCalculate = async () => {
        if (!customer || !selectedGoal) return;
        const currentAge = new Date().getFullYear() - new Date(customer.dob).getFullYear();
        let res: PlanResult | null = null;

        // Ensure numbers are numbers before calc
        const s = { ...surveyData };
        
        if (selectedGoal === FinancialGoal.RETIREMENT) {
            res = calculateRetirement(
                currentAge, s.retireAge, s.lifeExpectancy, s.desiredMonthlyIncome,
                s.inflation / 100, s.investRate / 100, s.existingSavings,
                { hasSI: s.hasSI, salaryForSI: s.salarySI }
            );
        } else if (selectedGoal === FinancialGoal.PROTECTION) {
            const existingCover = customerContracts.reduce((sum, c) => sum + c.mainProduct.sumAssured, 0);
            res = calculateProtection(
                s.annualIncome, s.supportYears, existingCover + s.existingSavings, s.loans, 0 
            );
        } else if (selectedGoal === FinancialGoal.EDUCATION) {
            res = calculateEducation(
                s.childAge, s.uniAge, s.uniDuration, s.currentTuition,
                s.inflation / 100, s.investRate / 100, s.existingSavings
            );
        }

        setPlanResult(res);
        setAdjustedMonthlySaving(res?.monthlySavingNeeded || 0);
        setStep(3);
        
        // Trigger AI Advice
        if (res) {
            setIsGeneratingAdvice(true);
            const advice = await generateFinancialAdvice(customer.fullName, res);
            setAiAdvice(advice);
            setIsGeneratingAdvice(false);
        }
    };

    const handleSavePlan = async () => {
        if (!customer || !planResult || !selectedGoal) return;
        const newPlan: FinancialPlanRecord = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            goal: selectedGoal,
            inputs: surveyData,
            result: planResult
        };
        const updatedCustomer = {
            ...customer,
            financialPlans: [...(customer.financialPlans || []), newPlan]
        };
        await onUpdateCustomer(updatedCustomer);
        alert("Đã lưu kết quả hoạch định vào hồ sơ khách hàng!");
    };

    const handleDesignSolution = () => {
        if (!planResult || !customer) return;
        navigate('/product-advisory', { 
            state: { 
                customerId: customer.id,
                suggestedSA: planResult.shortfall > 0 ? planResult.shortfall : 1000000000,
                goal: selectedGoal
            } 
        });
    };

    // ... (Chat Logic remains same)
    const switchRoleplayMode = (newMode: 'consultant' | 'customer') => { setRoleplayMode(newMode); setMessages([]); setSuggestions([]); setQuickReplies([]); };
    const processAIResponse = (text: string) => {
        let cleanText = text;
        const quickReplyRegex = /<QUICK_REPLIES>(.*?)<\/QUICK_REPLIES>/s;
        const match = text.match(quickReplyRegex);
        if (match) {
            try {
                const replies = JSON.parse(match[1]);
                if (Array.isArray(replies)) setQuickReplies(replies.slice(0, 3));
                cleanText = text.replace(quickReplyRegex, '').trim();
            } catch (e) {}
        } else { setQuickReplies([]); }
        return cleanText;
    };
    const handleStartChat = async () => {
        if (!customer) return;
        setMode('chat');
        if (messages.length === 0) {
            setIsSending(true);
            const initialPrompt = roleplayMode === 'consultant' ? "Hãy bắt đầu buổi tư vấn..." : "Hãy bắt đầu bằng một câu chào...";
            const rawResponse = await consultantChat(initialPrompt, customer, customerContracts, [], agentProfile, selectedGoal || '', [], roleplayMode, planResult, chatStyle);
            setMessages([{ role: 'model', text: processAIResponse(rawResponse) }]);
            setIsSending(false);
        }
    };
    useEffect(() => { if (mode === 'chat' && messages.length === 0) handleStartChat(); }, [mode, roleplayMode]);
    const handleSendMessage = async (msgText?: string) => {
        const textToSend = msgText || input;
        if (!textToSend.trim() || !customer) return;
        setInput(''); setQuickReplies([]); setSuggestions([]);
        setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
        setIsSending(true);
        const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        const rawResponse = await consultantChat(textToSend, customer, customerContracts, [], agentProfile, selectedGoal || '', history, roleplayMode, planResult, chatStyle);
        setMessages(prev => [...prev, { role: 'model', text: processAIResponse(rawResponse) }]);
        setIsSending(false);
    };
    const handleGetSuggestions = async () => {
        if (!customer || messages.length === 0) return;
        const lastAiMsg = [...messages].reverse().find(m => m.role === 'model');
        if (lastAiMsg) {
            setIsLoadingSuggestions(true);
            const results = await getObjectionSuggestions(lastAiMsg.text, customer);
            setSuggestions(results);
            setIsLoadingSuggestions(false);
        }
    };
    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(cleanMarkdownForClipboard(text));
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };
    
    // Sanitize output for Advisory Chat
    const formatMessageText = (text: string) => {
        const html = text.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        return DOMPurify.sanitize(html, { ADD_ATTR: ['class', 'style', 'target'] });
    };

    if (!customer) return <div className="p-8 text-center">Khách hàng không tồn tại.</div>;

    const renderStep1 = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                {[
                    { type: FinancialGoal.PROTECTION, icon: 'fa-shield-alt', color: 'blue', desc: 'Bảo vệ nguồn thu nhập' },
                    { type: FinancialGoal.RETIREMENT, icon: 'fa-umbrella-beach', color: 'green', desc: 'Hưu trí an nhàn' },
                    { type: FinancialGoal.EDUCATION, icon: 'fa-graduation-cap', color: 'orange', desc: 'Quỹ học vấn cho con' },
                    { type: FinancialGoal.HEALTH, icon: 'fa-heartbeat', color: 'pink', desc: 'Dự phòng y tế' }
                ].map(g => (
                    <button key={g.type} onClick={() => handleGoalSelect(g.type)} className={`bg-white dark:bg-pru-card p-6 rounded-xl border-2 border-transparent hover:border-${g.color}-500 shadow-sm hover:shadow-lg transition text-left group`}>
                        <div className={`w-12 h-12 rounded-full bg-${g.color}-100 text-${g.color}-600 flex items-center justify-center text-xl mb-3 group-hover:scale-110 transition`}><i className={`fas ${g.icon}`}></i></div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">{g.type}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{g.desc}</p>
                    </button>
                ))}
            </div>
            {customer.financialPlans && customer.financialPlans.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 animate-slide-up">
                    <h4 className="text-sm font-bold text-gray-500 uppercase mb-3"><i className="fas fa-history mr-1"></i> Lịch sử hoạch định</h4>
                    <div className="space-y-2">
                        {[...customer.financialPlans].reverse().map(plan => (
                            <div key={plan.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-center hover:shadow-sm transition">
                                <div><div className="font-bold text-gray-800 dark:text-gray-200 text-sm">{plan.goal}</div><div className="text-xs text-gray-500 dark:text-gray-400">{formatDateVN(plan.createdAt.split('T')[0])} • Gap: {plan.result.shortfall.toLocaleString()} đ</div></div>
                                <button onClick={() => loadPlan(plan)} className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg font-medium transition">Xem lại</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const renderStep2 = () => (
        <div className="max-w-xl mx-auto bg-white dark:bg-pru-card p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 animate-slide-up">
            <h3 className="font-bold text-xl text-gray-800 dark:text-gray-100 mb-4 flex items-center"><i className="fas fa-calculator mr-2 text-pru-red"></i> Khảo sát số liệu: {selectedGoal}</h3>
            <div className="space-y-4">
                {selectedGoal === FinancialGoal.RETIREMENT && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="label-text">Tuổi nghỉ hưu dự kiến</label><input type="number" className="input-field" value={surveyData.retireAge} onChange={e => setSurveyData({...surveyData, retireAge: Number(e.target.value)})} /></div>
                            <div><label className="label-text">Kỳ vọng sống đến</label><input type="number" className="input-field" value={surveyData.lifeExpectancy} onChange={e => setSurveyData({...surveyData, lifeExpectancy: Number(e.target.value)})} /></div>
                        </div>
                        <div><label className="label-text">Chi tiêu mong muốn / tháng (Giá hiện tại)</label><CurrencyInput className="input-field" value={surveyData.desiredMonthlyIncome} onChange={v => setSurveyData({...surveyData, desiredMonthlyIncome: v})} /></div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2"><label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center"><i className="fas fa-id-card-alt mr-2 text-blue-500"></i> Đã có BHXH bắt buộc?</label><input type="checkbox" className="w-5 h-5 accent-pru-red" checked={surveyData.hasSI} onChange={e => setSurveyData({...surveyData, hasSI: e.target.checked})} /></div>
                            {surveyData.hasSI && (<div><label className="label-text text-xs text-gray-500">Mức lương đóng BHXH hiện tại (VNĐ)</label><CurrencyInput className="input-field text-sm" value={surveyData.salarySI} onChange={v => setSurveyData({...surveyData, salarySI: v})} /></div>)}
                        </div>
                    </>
                )}
                {selectedGoal === FinancialGoal.PROTECTION && (
                    <>
                        <div><label className="label-text">Thu nhập năm của bạn</label><CurrencyInput className="input-field" value={surveyData.annualIncome} onChange={v => setSurveyData({...surveyData, annualIncome: v})} /></div>
                        <div><label className="label-text">Số năm cần bảo vệ</label><input type="number" className="input-field" value={surveyData.supportYears} onChange={e => setSurveyData({...surveyData, supportYears: Number(e.target.value)})} /></div>
                        <div><label className="label-text">Các khoản nợ tồn đọng</label><CurrencyInput className="input-field" value={surveyData.loans} onChange={v => setSurveyData({...surveyData, loans: v})} /></div>
                    </>
                )}
                {selectedGoal === FinancialGoal.EDUCATION && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="label-text">Tuổi con hiện tại</label><input type="number" className="input-field" value={surveyData.childAge} onChange={e => setSurveyData({...surveyData, childAge: Number(e.target.value)})} /></div>
                            <div><label className="label-text">Tuổi vào Đại học</label><input type="number" className="input-field" value={surveyData.uniAge} onChange={e => setSurveyData({...surveyData, uniAge: Number(e.target.value)})} /></div>
                        </div>
                        <div><label className="label-text">Học phí Đại học / năm (Hiện tại)</label><CurrencyInput className="input-field" value={surveyData.currentTuition} onChange={v => setSurveyData({...surveyData, currentTuition: v})} /></div>
                    </>
                )}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <label className="label-text">Tài sản / Tiết kiệm đã có</label><CurrencyInput className="input-field bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800" value={surveyData.existingSavings} onChange={v => setSurveyData({...surveyData, existingSavings: v})} />
                </div>
                {selectedGoal !== FinancialGoal.PROTECTION && (
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="label-text">Lạm phát (%)</label><input type="number" className="input-field font-bold text-orange-600" value={surveyData.inflation} onChange={e => setSurveyData({...surveyData, inflation: Number(e.target.value)})} /></div>
                        <div><label className="label-text">Lãi đầu tư (%)</label><input type="number" className="input-field" value={surveyData.investRate} onChange={e => setSurveyData({...surveyData, investRate: Number(e.target.value)})} /></div>
                    </div>
                )}
                <div className="flex gap-3 mt-6">
                    <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-500 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition">Quay lại</button>
                    <button onClick={handleCalculate} className="flex-1 bg-pru-red text-white py-3 rounded-lg font-bold hover:bg-red-700 transition shadow-lg">Phân tích Gap <i className="fas fa-arrow-right ml-2"></i></button>
                </div>
            </div>
        </div>
    );

    const renderAnalysisDetail = () => {
        if (!planResult) return null;
        const details = planResult.details;

        return (
            <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
                <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center">
                    <i className="fas fa-info-circle mr-2 text-blue-500"></i> Tại sao lại ra con số này?
                </h4>
                
                {planResult.goal === FinancialGoal.RETIREMENT && (
                    <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                        <li>
                            <i className="fas fa-chart-line mr-2 text-orange-500"></i> 
                            Với lạm phát <b>{surveyData.inflation}%</b>, mức chi tiêu <b>{surveyData.desiredMonthlyIncome.toLocaleString()}</b> hiện tại sẽ tương đương <b>{Math.round(details.futureMonthlyExpense).toLocaleString()}</b> vào năm bạn nghỉ hưu.
                        </li>
                        <li>
                            <i className="fas fa-piggy-bank mr-2 text-green-500"></i>
                            Để duy trì mức sống này trong <b>{details.yearsInRetirement} năm</b> (từ {surveyData.retireAge} đến {surveyData.lifeExpectancy} tuổi), tổng quỹ cần là <b>{planResult.requiredAmount.toLocaleString()}</b>.
                        </li>
                        {details.estimatedPension > 0 && (
                            <li>
                                <i className="fas fa-shield-alt mr-2 text-blue-500"></i>
                                Trừ đi lương hưu BHXH ước tính: <b>{Math.round(details.estimatedPension).toLocaleString()} /tháng</b>.
                            </li>
                        )}
                        <li>
                            <i className="fas fa-exclamation-triangle mr-2 text-red-500"></i>
                            Do đó, số tiền bạn còn thiếu (Gap) là: <b className="text-red-600 dark:text-red-400">{planResult.shortfall.toLocaleString()}</b>.
                        </li>
                    </ul>
                )}

                {planResult.goal === FinancialGoal.EDUCATION && (
                    <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                        <li>
                            <i className="fas fa-chart-line mr-2 text-orange-500"></i>
                            Học phí hiện tại <b>{surveyData.currentTuition.toLocaleString()}</b>. Với lạm phát giáo dục <b>{surveyData.inflation}%</b>, học phí năm đầu ĐH (sau {details.yearsToUni} năm nữa) sẽ là <b>{Math.round(details.futureTuitionFirstYear).toLocaleString()}</b>.
                        </li>
                        <li>
                            <i className="fas fa-graduation-cap mr-2 text-blue-500"></i>
                            Tổng chi phí cho <b>{details.uniDuration} năm</b> đại học dự kiến là <b>{planResult.requiredAmount.toLocaleString()}</b>.
                        </li>
                        <li>
                            <i className="fas fa-seedling mr-2 text-green-500"></i>
                            Nếu tích lũy ngay bây giờ với lãi suất <b>{surveyData.investRate}%</b>, bạn cần để dành <b>{planResult.monthlySavingNeeded?.toLocaleString()} /tháng</b>.
                        </li>
                    </ul>
                )}

                {planResult.goal === FinancialGoal.PROTECTION && (
                    <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                        <li>
                            <i className="fas fa-user-shield mr-2 text-blue-500"></i>
                            Bảo vệ nguồn thu nhập trong <b>{details.supportYears} năm</b>: {surveyData.annualIncome.toLocaleString()} x {details.supportYears} = <b>{details.incomeProtectionNeeded.toLocaleString()}</b>.
                        </li>
                        <li>
                            <i className="fas fa-home mr-2 text-orange-500"></i>
                            Cộng khoản nợ tồn đọng cần thanh toán ngay: <b>+{details.loans.toLocaleString()}</b>.
                        </li>
                        <li>
                            <i className="fas fa-coins mr-2 text-green-500"></i>
                            Trừ đi tài sản/BH hiện có: <b>-{planResult.currentAmount.toLocaleString()}</b>.
                        </li>
                        <li className="font-bold text-red-600 dark:text-red-400">
                            => Mệnh giá bảo hiểm cần thiết (Gap): {planResult.shortfall.toLocaleString()}.
                        </li>
                    </ul>
                )}
            </div>
        );
    };

    const renderStep3 = () => {
        if (!planResult) return <div className="text-center text-red-500">Lỗi tính toán. Vui lòng kiểm tra lại số liệu đầu vào.</div>;
        const percentMet = planResult.requiredAmount > 0 ? Math.min(100, Math.round((planResult.currentAmount / planResult.requiredAmount) * 100)) : 0;

        return (
            <div className="max-w-2xl mx-auto bg-white dark:bg-pru-card p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 animate-slide-up">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">{planResult.goal}</h2>
                    <p className="text-gray-500 dark:text-gray-400">Kết quả phân tích tài chính</p>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Đã chuẩn bị</span>
                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Mục tiêu</span>
                </div>
                <div className="relative h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-6">
                    <div className={`absolute top-0 left-0 h-full transition-all duration-1000 ${percentMet < 50 ? 'bg-red-500' : percentMet < 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{width: `${percentMet}%`}}></div>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white shadow-sm">{percentMet}%</span>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-6">
                    <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Cần có (Tương lai)</p>
                        <p className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-1">{planResult.requiredAmount.toLocaleString()} <span className="text-xs font-normal">đ</span></p>
                    </div>
                    <div className="text-center p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                        <p className="text-xs text-red-500 uppercase font-bold">Thiếu hụt (Gap)</p>
                        <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{planResult.shortfall.toLocaleString()} <span className="text-xs font-normal">đ</span></p>
                    </div>
                </div>

                {/* LOGIC EXPLANATION TOGGLE */}
                <div className="mb-4">
                    <button 
                        onClick={() => setShowExplanation(!showExplanation)}
                        className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition border border-dashed border-blue-200 dark:border-blue-800"
                    >
                        {showExplanation ? 'Ẩn chi tiết tính toán' : 'Xem chi tiết: Tại sao lại là con số này?'}
                        <i className={`fas ml-2 ${showExplanation ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                    </button>
                    {showExplanation && renderAnalysisDetail()}
                </div>

                {/* AI ADVICE SECTION */}
                <div className="mb-6 bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 relative">
                    <h4 className="text-sm font-bold text-purple-700 dark:text-purple-300 mb-2 flex items-center">
                        <i className="fas fa-robot mr-2"></i> Góc nhìn chuyên gia AI
                    </h4>
                    {isGeneratingAdvice ? (
                        <div className="flex items-center text-xs text-gray-500"><i className="fas fa-spinner fa-spin mr-2"></i> Đang phân tích dữ liệu...</div>
                    ) : (
                        <p className="text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed">
                            "{aiAdvice}"
                        </p>
                    )}
                </div>

                {/* WHAT-IF SLIDER */}
                {planResult.shortfall > 0 && planResult.monthlySavingNeeded && planResult.monthlySavingNeeded > 0 && (
                    <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-end mb-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Tiết kiệm thêm mỗi tháng</label>
                            <span className="text-lg font-bold text-green-600">{adjustedMonthlySaving.toLocaleString()} đ</span>
                        </div>
                        <input 
                            type="range" 
                            min={0} 
                            max={planResult.monthlySavingNeeded * 1.5} 
                            step={500000}
                            value={adjustedMonthlySaving} 
                            onChange={(e) => setAdjustedMonthlySaving(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                        />
                        <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                            <span>0</span>
                            <span>Cần thiết: {planResult.monthlySavingNeeded.toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* ACTIONS */}
                {planResult.shortfall > 0 ? (
                    <div className="text-center space-y-4">
                        <div className="flex justify-center gap-3">
                            <button onClick={handleStartChat} className="bg-purple-600 text-white px-5 py-3 rounded-full font-bold shadow-lg hover:bg-purple-700 transition flex items-center animate-pulse text-sm">
                                <i className="fas fa-comments mr-2"></i> Tập Roleplay
                            </button>
                            <button onClick={handleDesignSolution} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-5 py-3 rounded-full font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center text-sm">
                                <i className="fas fa-pen-fancy mr-2"></i> Thiết kế Giải pháp
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-6 bg-green-50 dark:bg-green-900/10 rounded-xl text-green-800 dark:text-green-300">
                        <i className="fas fa-check-circle text-4xl mb-3"></i>
                        <h3 className="font-bold text-lg">Mục tiêu an toàn!</h3>
                        <p>Tài chính hiện tại đã đáp ứng đủ mục tiêu này.</p>
                        <button onClick={() => setStep(1)} className="mt-4 text-sm font-bold underline">Khảo sát mục tiêu khác</button>
                    </div>
                )}
                
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => setStep(2)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline">Điều chỉnh số liệu</button>
                    <button onClick={handleSavePlan} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                        <i className="fas fa-save mr-1.5"></i> Lưu hồ sơ
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] md:h-screen bg-gray-100 dark:bg-black transition-colors">
            {/* Header */}
            <div className="bg-white dark:bg-pru-card border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/customers')} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Hoạch định Tài chính: {customer.fullName}</h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Bước {step}/3: {step === 1 ? 'Chọn nhu cầu' : step === 2 ? 'Khảo sát' : 'Phân tích & Giải pháp'}</p>
                    </div>
                </div>
                {/* Mode Toggle */}
                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex text-xs font-bold">
                    <button onClick={() => setMode('plan')} className={`px-3 py-1.5 rounded-md transition ${mode === 'plan' ? 'bg-white dark:bg-gray-600 shadow text-pru-red dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Hoạch định</button>
                    <button onClick={() => { setMode('chat'); if (messages.length === 0) handleStartChat(); }} className={`px-3 py-1.5 rounded-md transition ${mode === 'chat' ? 'bg-white dark:bg-gray-600 shadow text-purple-600 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'}`}>Roleplay</button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                {mode === 'plan' ? (
                    <>
                        {step === 1 && renderStep1()}
                        {step === 2 && renderStep2()}
                        {step === 3 && renderStep3()}
                    </>
                ) : (
                    // CHAT INTERFACE (Kept concise as per requirement to not modify unless needed, but included for completeness of page)
                    <div className="h-full flex flex-col bg-white dark:bg-pru-card rounded-xl shadow overflow-hidden max-w-4xl mx-auto border border-gray-200 dark:border-gray-700 transition-colors">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/10 flex justify-between items-center">
                            <div className="flex items-center">
                                <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mr-3"><i className={`fas ${roleplayMode === 'consultant' ? 'fa-user-tie' : 'fa-user-tag'}`}></i></div>
                                <div><h3 className="font-bold text-gray-800 dark:text-gray-100">Roleplay: {roleplayMode === 'consultant' ? 'Tư vấn mẫu' : 'Luyện tập'}</h3></div>
                            </div>
                            <div className="flex items-center gap-3">
                                <select value={chatStyle} onChange={(e) => setChatStyle(e.target.value as 'zalo' | 'formal')} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-xs font-bold py-1.5 px-3 rounded-lg"><option value="formal">Chuyên nghiệp</option><option value="zalo">Chat Zalo</option></select>
                                <div className="flex bg-white dark:bg-gray-800 p-1 rounded-lg border border-purple-100 dark:border-gray-600"><button onClick={() => switchRoleplayMode('consultant')} className={`px-3 py-1 rounded text-xs font-bold ${roleplayMode === 'consultant' ? 'bg-purple-100 text-purple-700' : 'text-gray-400'}`}>AI Tư vấn</button><button onClick={() => switchRoleplayMode('customer')} className={`px-3 py-1 rounded text-xs font-bold ${roleplayMode === 'customer' ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>AI Khách</button></div>
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50 dark:bg-gray-900/50">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                                    <div className={`relative group max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-none'}`}>
                                        <div dangerouslySetInnerHTML={{ __html: formatMessageText(msg.text) }} />
                                        {msg.role === 'model' && <button onClick={() => handleCopy(msg.text, idx)} className={`absolute bottom-1 right-1 p-1.5 rounded-md transition-all ${copiedIndex === idx ? 'text-green-500 opacity-100' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}><i className={`fas ${copiedIndex === idx ? 'fa-check' : 'fa-copy'} text-xs`}></i></button>}
                                    </div>
                                </div>
                            ))}
                            {isSending && <div className="flex justify-start"><div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm"><div className="flex space-x-1"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div></div></div></div>}
                            <div ref={messagesEndRef} />
                        </div>
                        {/* Quick Replies */}
                        {quickReplies.length > 0 && !isSending && (
                            <div className="px-4 py-2 bg-white dark:bg-pru-card border-t border-gray-100 dark:border-gray-700 overflow-x-auto whitespace-nowrap scrollbar-hide">
                                <span className="text-[10px] text-gray-400 font-bold mr-2 uppercase">Gợi ý:</span>
                                {quickReplies.map((reply, idx) => (
                                    <button key={idx} onClick={() => handleSendMessage(reply)} className="inline-block mr-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-xs font-bold border border-blue-100 dark:border-blue-900/50 hover:bg-blue-100 transition">{reply}</button>
                                ))}
                            </div>
                        )}
                        {/* Coach Suggestions */}
                        {roleplayMode === 'customer' && (
                            <div className="px-4 pb-2 bg-white dark:bg-pru-card">
                                {suggestions.length > 0 ? (
                                    <div className="space-y-2 animate-slide-up"><p className="text-xs font-bold text-gray-400 uppercase">Gợi ý xử lý từ chối:</p><div className="grid grid-cols-1 gap-2">{suggestions.map((s, idx) => (<button key={idx} onClick={() => {setInput(s.content); setSuggestions([]);}} className="text-left bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 p-3 rounded-lg border border-orange-100 dark:border-orange-800 transition"><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase text-white ${s.type === 'empathy' ? 'bg-pink-500' : s.type === 'logic' ? 'bg-blue-500' : 'bg-green-500'}`}>{s.label}</span></div><p className="text-xs text-gray-700 dark:text-gray-300">{s.content}</p></button>))}</div></div>
                                ) : (
                                    <div className="flex justify-end"><button onClick={handleGetSuggestions} disabled={isLoadingSuggestions || messages.length < 2} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-3 py-2 rounded-lg hover:bg-orange-50 transition flex items-center gap-2 disabled:opacity-50">{isLoadingSuggestions ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lightbulb"></i>} Gợi ý xử lý (Coach)</button></div>
                                )}
                            </div>
                        )}
                        <div className="p-4 bg-white dark:bg-pru-card border-t border-gray-100 dark:border-gray-700">
                            <div className="relative">
                                <input type="text" className="w-full pl-4 pr-12 py-3 bg-gray-100 dark:bg-gray-800 border-none rounded-full focus:ring-2 focus:ring-purple-300 outline-none text-gray-800 dark:text-gray-200" placeholder={roleplayMode === 'consultant' ? "Nhập câu trả lời..." : "Nhập cách tư vấn..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} disabled={isSending} />
                                <button onClick={() => handleSendMessage()} disabled={!input.trim() || isSending} className="absolute right-2 top-2 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center hover:bg-purple-700 disabled:opacity-50"><i className="fas fa-paper-plane text-xs"></i></button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                .label-text { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
                .dark .label-text { color: #9ca3af; }
                .input-field { width: 100%; border: 1px solid #e5e7eb; padding: 0.625rem; border-radius: 0.5rem; outline: none; font-size: 0.875rem; transition: all; background-color: #fff; color: #111827; }
                .dark .input-field { background-color: #111827; border-color: #374151; color: #f3f4f6; }
                .input-field:focus { border-color: #ed1b2e; ring: 2px solid #fee2e2; }
                .dark .input-field:focus { ring: 1px solid #ed1b2e; }
                @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .animate-slide-up { animation: slide-up 0.4s ease-out; }
            `}</style>
        </div>
    );
};

export default AdvisoryPage;
