
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { User } from "firebase/auth";
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIChat from './pages/AIChat';
import CustomersPage from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import ContractsPage from './pages/Contracts';
import ProductsPage from './pages/Products';
import AppointmentsPage from './pages/Appointments';
import MessageTemplatesPage from './pages/MessageTemplates';
import SettingsPage from './pages/Settings';
import AdvisoryPage from './pages/Advisory';
import MarketingPage from './pages/Marketing';
import ProductAdvisoryPage from './pages/ProductAdvisory';
import LoginPage from './pages/Login';

import { AppState, Customer, Contract, Product, Appointment, MessageTemplate, AgentProfile, Illustration, ContractStatus, PaymentFrequency } from './types';
import { subscribeToCollection, addData, updateData, deleteData, COLLECTIONS } from './services/db';
import { subscribeToAuth } from './services/auth';
import { isFirebaseReady, saveFirebaseConfig } from './services/firebaseConfig';

const App: React.FC = () => {
    // --- AUTH STATE ---
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    // --- APP DATA STATE ---
    const [state, setState] = useState<AppState>({
        customers: [],
        contracts: [],
        products: [],
        appointments: [],
        agentProfile: null,
        messageTemplates: [],
        illustrations: []
    });

    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        return localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Config Form State
    const [configForm, setConfigForm] = useState({
        apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '', geminiKey: ''
    });

    // --- CONFIG CHECK & SETUP FORM ---
    if (!isFirebaseReady) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-white max-w-lg w-full p-8 rounded-2xl shadow-xl border border-gray-100">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-red-100 text-pru-red rounded-full flex items-center justify-center mx-auto mb-4 text-2xl animate-bounce">
                            <i className="fas fa-cogs"></i>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800 mb-2">Cấu hình Hệ thống</h1>
                        <p className="text-gray-500 text-sm">
                            Vui lòng nhập thông tin kết nối Firebase và Gemini API để bắt đầu. Dữ liệu này sẽ được lưu an toàn trong trình duyệt của bạn.
                        </p>
                    </div>
                    
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Firebase API Key</label>
                            <input className="input-field w-full border p-2 rounded" placeholder="AIzaSy..." value={configForm.apiKey} onChange={e => setConfigForm({...configForm, apiKey: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Project ID</label>
                                <input className="input-field w-full border p-2 rounded" placeholder="my-project-id" value={configForm.projectId} onChange={e => setConfigForm({...configForm, projectId: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Auth Domain</label>
                                <input className="input-field w-full border p-2 rounded" placeholder="my-project.firebaseapp.com" value={configForm.authDomain} onChange={e => setConfigForm({...configForm, authDomain: e.target.value})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Storage Bucket</label>
                                <input className="input-field w-full border p-2 rounded" placeholder="my-project.appspot.com" value={configForm.storageBucket} onChange={e => setConfigForm({...configForm, storageBucket: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Messaging Sender ID</label>
                                <input className="input-field w-full border p-2 rounded" placeholder="123456789" value={configForm.messagingSenderId} onChange={e => setConfigForm({...configForm, messagingSenderId: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">App ID</label>
                            <input className="input-field w-full border p-2 rounded" placeholder="1:123456789:web:..." value={configForm.appId} onChange={e => setConfigForm({...configForm, appId: e.target.value})} />
                        </div>
                        
                        <div className="pt-4 border-t border-gray-100">
                            <label className="block text-xs font-bold text-purple-700 mb-1 flex items-center"><i className="fas fa-magic mr-1"></i> Gemini API Key (AI)</label>
                            <input className="input-field w-full border border-purple-200 p-2 rounded bg-purple-50 focus:ring-purple-200" placeholder="AIzaSy..." value={configForm.geminiKey} onChange={e => setConfigForm({...configForm, geminiKey: e.target.value})} type="password" />
                            <p className="text-[10px] text-gray-400 mt-1 italic">Lấy key tại: aistudio.google.com</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => {
                            if(!configForm.apiKey || !configForm.projectId) return alert("Vui lòng nhập tối thiểu API Key và Project ID");
                            // Save Gemini Key Separately
                            if(configForm.geminiKey) localStorage.setItem('gemini_api_key', configForm.geminiKey);
                            // Save Firebase Config
                            saveFirebaseConfig({
                                apiKey: configForm.apiKey,
                                authDomain: configForm.authDomain,
                                projectId: configForm.projectId,
                                storageBucket: configForm.storageBucket,
                                messagingSenderId: configForm.messagingSenderId,
                                appId: configForm.appId
                            });
                        }}
                        className="w-full mt-6 bg-pru-red text-white font-bold py-3 rounded-xl hover:bg-red-700 transition shadow-lg flex items-center justify-center"
                    >
                        <i className="fas fa-save mr-2"></i> Lưu & Kết nối
                    </button>
                </div>
            </div>
        );
    }

    // --- AUTH LISTENER ---
    useEffect(() => {
        const unsubscribe = subscribeToAuth((currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // --- DATA LISTENERS (Only when authenticated) ---
    useEffect(() => {
        if (!user) {
            // Clear sensitive data on logout
            setState({
                customers: [], contracts: [], products: [], appointments: [], 
                agentProfile: null, messageTemplates: [], illustrations: []
            });
            return;
        }

        const unsubs = [
            subscribeToCollection(COLLECTIONS.CUSTOMERS, (data) => setState(prev => ({ ...prev, customers: data }))),
            subscribeToCollection(COLLECTIONS.PRODUCTS, (data) => setState(prev => ({ ...prev, products: data }))),
            subscribeToCollection(COLLECTIONS.CONTRACTS, (data) => setState(prev => ({ ...prev, contracts: data }))),
            subscribeToCollection(COLLECTIONS.APPOINTMENTS, (data) => setState(prev => ({ ...prev, appointments: data }))),
            subscribeToCollection(COLLECTIONS.MESSAGE_TEMPLATES, (data) => setState(prev => ({ ...prev, messageTemplates: data }))),
            subscribeToCollection(COLLECTIONS.ILLUSTRATIONS, (data) => setState(prev => ({ ...prev, illustrations: data }))),
            subscribeToCollection(COLLECTIONS.SETTINGS, (data) => {
                if (data && data.length > 0) setState(prev => ({ ...prev, agentProfile: data[0] as AgentProfile }));
            })
        ];
        return () => unsubs.forEach(unsub => unsub());
    }, [user]);

    // --- THEME LOGIC ---
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.theme = 'light';
        }
    }, [isDarkMode]);

    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    // --- CRUD WRAPPERS ---
    const addCustomer = async (c: Customer) => await addData(COLLECTIONS.CUSTOMERS, c);
    const updateCustomer = async (c: Customer) => await updateData(COLLECTIONS.CUSTOMERS, c.id, c);
    const deleteCustomer = async (id: string) => await deleteData(COLLECTIONS.CUSTOMERS, id);

    const addContract = async (c: Contract) => await addData(COLLECTIONS.CONTRACTS, c);
    const updateContract = async (c: Contract) => await updateData(COLLECTIONS.CONTRACTS, c.id, c);
    const deleteContract = async (id: string) => await deleteData(COLLECTIONS.CONTRACTS, id);

    const addProduct = async (p: Product) => await addData(COLLECTIONS.PRODUCTS, p);
    const updateProduct = async (p: Product) => await updateData(COLLECTIONS.PRODUCTS, p.id, p);
    const deleteProduct = async (id: string) => await deleteData(COLLECTIONS.PRODUCTS, id);

    const addAppointment = async (a: Appointment) => await addData(COLLECTIONS.APPOINTMENTS, a);
    const updateAppointment = async (a: Appointment) => await updateData(COLLECTIONS.APPOINTMENTS, a.id, a);
    const deleteAppointment = async (id: string) => await deleteData(COLLECTIONS.APPOINTMENTS, id);

    const addTemplate = async (t: MessageTemplate) => await addData(COLLECTIONS.MESSAGE_TEMPLATES, t);
    const updateTemplate = async (t: MessageTemplate) => await updateData(COLLECTIONS.MESSAGE_TEMPLATES, t.id, t);
    const deleteTemplate = async (id: string) => await deleteData(COLLECTIONS.MESSAGE_TEMPLATES, id);

    const saveIllustration = async (ill: Illustration) => await addData(COLLECTIONS.ILLUSTRATIONS, ill);
    const deleteIllustration = async (id: string) => await deleteData(COLLECTIONS.ILLUSTRATIONS, id);
    
    const convertIllustration = async (ill: Illustration, customerId: string) => {
        const newContract: Contract = {
            id: '',
            contractNumber: `NEW-${Date.now().toString().slice(-6)}`,
            customerId: customerId,
            effectiveDate: new Date().toISOString().split('T')[0],
            nextPaymentDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            status: ContractStatus.PENDING,
            paymentFrequency: PaymentFrequency.ANNUAL,
            totalFee: ill.totalFee,
            mainProduct: ill.mainProduct,
            riders: ill.riders,
            beneficiary: ''
        };
        
        await addContract(newContract);
        await updateData(COLLECTIONS.ILLUSTRATIONS, ill.id, { ...ill, status: 'CONVERTED' });
    };

    const saveProfile = async (profile: AgentProfile) => {
        if (state.agentProfile && state.agentProfile.id) {
            await updateData(COLLECTIONS.SETTINGS, state.agentProfile.id, profile);
        } else {
            await addData(COLLECTIONS.SETTINGS, profile);
        }
    };

    // --- LOADING SCREEN ---
    if (authLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-pru-red border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-500 font-bold">Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

    // --- ROUTING ---
    return (
        <Router>
            {!user ? (
                <Routes>
                    <Route path="*" element={<LoginPage />} />
                </Routes>
            ) : (
                <>
                    <Layout onToggleChat={() => setIsChatOpen(!isChatOpen)} user={user}>
                        <Routes>
                            <Route path="/" element={<Dashboard state={state} onUpdateContract={updateContract} />} />
                            <Route path="/customers" element={
                                <CustomersPage 
                                    customers={state.customers} 
                                    contracts={state.contracts} 
                                    illustrations={state.illustrations}
                                    onAdd={addCustomer} 
                                    onUpdate={updateCustomer} 
                                    onDelete={deleteCustomer} 
                                    onConvertIllustration={convertIllustration}
                                    onDeleteIllustration={deleteIllustration}
                                />
                            } />
                            <Route path="/customers/:id" element={
                                <CustomerDetail 
                                    customers={state.customers} 
                                    contracts={state.contracts} 
                                    onUpdateCustomer={updateCustomer}
                                />
                            } />
                            <Route path="/product-advisory" element={
                                <ProductAdvisoryPage 
                                    customers={state.customers} 
                                    products={state.products}
                                    onSaveIllustration={saveIllustration}
                                />
                            } />
                            <Route path="/contracts" element={<ContractsPage contracts={state.contracts} customers={state.customers} products={state.products} onAdd={addContract} onUpdate={updateContract} onDelete={deleteContract} />} />
                            <Route path="/products" element={<ProductsPage products={state.products} onAdd={addProduct} onUpdate={updateProduct} onDelete={deleteProduct} />} />
                            <Route path="/appointments" element={<AppointmentsPage appointments={state.appointments} customers={state.customers} contracts={state.contracts} onAdd={addAppointment} onUpdate={updateAppointment} onDelete={deleteAppointment} />} />
                            <Route path="/marketing" element={<MarketingPage profile={state.agentProfile} />} />
                            <Route path="/templates" element={<MessageTemplatesPage templates={state.messageTemplates} customers={state.customers} contracts={state.contracts} onAdd={addTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate} />} />
                            <Route path="/settings" element={<SettingsPage profile={state.agentProfile} onSave={saveProfile} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />} />
                            <Route path="/advisory/:id" element={<AdvisoryPage customers={state.customers} contracts={state.contracts} agentProfile={state.agentProfile} onUpdateCustomer={updateCustomer} />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Layout>
                    <AIChat state={state} isOpen={isChatOpen} setIsOpen={setIsChatOpen} />
                </>
            )}
        </Router>
    );
};

export default App;
