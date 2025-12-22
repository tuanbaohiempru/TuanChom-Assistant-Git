import React, { useState, useEffect, useRef } from 'react';
import { Customer } from '../types';

// --- HELPER FUNCTIONS ---

export const formatDateVN = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
};

export const formatAdvisoryContent = (text: string) => {
    let html = text;
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-pru-red font-bold text-base mt-3 mb-1 border-b border-red-100 pb-1">$1</h3>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 bg-red-50 px-1 rounded border border-red-100">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-gray-500">$1</em>');
    html = html.replace(/^\- (.*$)/gim, '<div class="flex items-start ml-1 mb-1"><span class="text-pru-red mr-2 font-bold">•</span><span>$1</span></div>');
    html = html.replace(/\n/g, '<br />');
    return html;
};

export const cleanMarkdownForClipboard = (text: string) => {
    let clean = text;
    clean = clean.replace(/^###\s+(.*$)/gim, (match, p1) => p1.toUpperCase());
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');
    clean = clean.replace(/\*(.*?)\*/g, '$1');
    clean = clean.replace(/^\-\s+/gim, '• ');
    return clean;
};

// --- SHARED COMPONENTS ---

export const CurrencyInput: React.FC<{
    value: number;
    onChange: (val: number) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}> = ({ value, onChange, placeholder, className, disabled }) => {
    const formatNumber = (num: number) => {
        return num === 0 ? '' : num.toLocaleString('vi-VN');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\./g, '').replace(/\D/g, '');
        const numericValue = Number(rawValue);
        onChange(numericValue);
    };

    return (
        <div className="relative w-full">
            <input
                type="text"
                value={formatNumber(value)}
                onChange={handleChange}
                placeholder={placeholder}
                className={className}
                disabled={disabled}
            />
            {value > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                    VND
                </span>
            )}
        </div>
    );
};

export const SearchableCustomerSelect: React.FC<{
    customers: Customer[];
    value: string;
    onChange: (customer: Customer) => void; 
    label?: string;
    placeholder?: string;
    className?: string;
}> = ({ customers, value, onChange, label, placeholder, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const filtered = customers.filter(c => 
        c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.idCard && c.idCard.includes(searchTerm))
    );

    const handleSelect = (customer: Customer) => {
        onChange(customer);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`relative ${className || ''}`} ref={wrapperRef}>
            {label && <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>}
            <div 
                className="w-full border border-gray-300 p-2.5 rounded-lg focus-within:ring-2 focus-within:ring-red-200 bg-white flex justify-between items-center cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400'} truncate`}>
                    {value || placeholder || "Chọn khách hàng"}
                </span>
                <i className="fas fa-chevron-down text-gray-400 text-xs ml-2"></i>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col min-w-[250px]">
                    <div className="p-2 border-b border-gray-100 bg-gray-50">
                        <input
                            type="text"
                            autoFocus
                            className="w-full text-sm p-1.5 border border-gray-300 rounded outline-none focus:border-red-400"
                            placeholder="Tìm tên, SĐT, CCCD..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filtered.length > 0 ? (
                            filtered.map(c => (
                                <div 
                                    key={c.id}
                                    onClick={() => handleSelect(c)}
                                    className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b border-gray-50 last:border-0"
                                >
                                    <div className="font-medium text-sm text-gray-800">{c.fullName}</div>
                                    <div className="text-xs text-gray-500">
                                        <i className="fas fa-phone-alt mr-1"></i>{c.phone} 
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-3 text-center text-xs text-gray-400">Không tìm thấy kết quả</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export const ConfirmModal: React.FC<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onClose: () => void;
}> = ({ isOpen, title, message, confirmLabel = "Xóa", cancelLabel = "Hủy", onConfirm, onClose }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all scale-100 border border-gray-100">
                <div className="p-6 text-center">
                    <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                        <i className="fas fa-trash-alt text-xl text-red-500"></i>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
                    <div className="text-gray-500 text-sm mb-6 leading-relaxed">{message}</div>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={onClose}
                            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
                        >
                            {cancelLabel}
                        </button>
                        <button 
                            onClick={() => { onConfirm(); onClose(); }}
                            className="px-4 py-2.5 bg-pru-red hover:bg-red-700 text-white rounded-xl font-medium shadow-lg shadow-red-500/30 transition"
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};