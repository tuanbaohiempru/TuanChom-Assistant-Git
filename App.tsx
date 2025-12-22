import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIChat from './pages/AIChat';
import CustomersPage from './pages/Customers';
import ContractsPage from './pages/Contracts';
import ProductsPage from './pages/Products';
import AppointmentsPage from './pages/Appointments';
import MessageTemplatesPage from './pages/MessageTemplates';
import SettingsPage from './pages/Settings';
import AdvisoryPage from './pages/Advisory';

import { AppState, Customer, Contract, Product, Appointment, MessageTemplate, AgentProfile } from './types';
import { subscribeToCollection, addData, updateData, deleteData, COLLECTIONS } from './services/db';

const App: React.FC = () => {
    const [state, setState] = useState<AppState>({
        customers: [],
        contracts: [],
        products: [],
        appointments: [],
        agentProfile: null,
        messageTemplates: []
    });

    // --- REALTIME DATABASE SUBSCRIPTIONS ---
    useEffect(() => {
        const unsubs = [
            subscribeToCollection(COLLECTIONS.CUSTOMERS, (data) => setState(prev => ({ ...prev, customers: data }))),
            subscribeToCollection(COLLECTIONS.PRODUCTS, (data) => setState(prev => ({ ...prev, products: data }))),
            subscribeToCollection(COLLECTIONS.CONTRACTS, (data) => setState(prev => ({ ...prev, contracts: data }))),
            subscribeToCollection(COLLECTIONS.APPOINTMENTS, (data) => setState(prev => ({ ...prev, appointments: data }))),
            subscribeToCollection(COLLECTIONS.MESSAGE_TEMPLATES, (data) => setState(prev => ({ ...prev, messageTemplates: data }))),
            subscribeToCollection(COLLECTIONS.SETTINGS, (data) => {
                if (data && data.length > 0) setState(prev => ({ ...prev, agentProfile: data[0] as AgentProfile }));
            })
        ];
        return () => unsubs.forEach(unsub => unsub());
    }, []);

    // CRUD Handlers
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

    const saveProfile = async (profile: AgentProfile) => {
        if (state.agentProfile && state.agentProfile.id) {
            await updateData(COLLECTIONS.SETTINGS, state.agentProfile.id, profile);
        } else {
            await addData(COLLECTIONS.SETTINGS, profile);
        }
    };

    return (
        <Router>
            <Layout>
                <Routes>
                    <Route path="/" element={<Dashboard state={state} onUpdateContract={updateContract} />} />
                    <Route path="/customers" element={<CustomersPage customers={state.customers} contracts={state.contracts} onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} />} />
                    <Route path="/contracts" element={<ContractsPage contracts={state.contracts} customers={state.customers} products={state.products} onAdd={addContract} onUpdate={updateContract} onDelete={deleteContract} />} />
                    <Route path="/products" element={<ProductsPage products={state.products} onAdd={addProduct} onUpdate={updateProduct} onDelete={deleteProduct} />} />
                    <Route path="/appointments" element={<AppointmentsPage appointments={state.appointments} customers={state.customers} contracts={state.contracts} onAdd={addAppointment} onUpdate={updateAppointment} onDelete={deleteAppointment} />} />
                    <Route path="/templates" element={<MessageTemplatesPage templates={state.messageTemplates} customers={state.customers} contracts={state.contracts} onAdd={addTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate} />} />
                    <Route path="/settings" element={<SettingsPage profile={state.agentProfile} onSave={saveProfile} />} />
                    <Route path="/advisory/:id" element={<AdvisoryPage customers={state.customers} contracts={state.contracts} agentProfile={state.agentProfile} />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Layout>
            <AIChat state={state} />
        </Router>
    );
};

export default App;