
import React, { useState } from 'react';
import { loginWithGoogle, loginWithEmail, registerWithEmail } from '../services/auth';

const LoginPage: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Email/Pass State
    const [isRegistering, setIsRegistering] = useState(false); // Toggle Login/Register mode
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const mapAuthError = (errCode: string) => {
        switch (errCode) {
            case 'auth/configuration-not-found': return 'Lỗi: Chưa bật Provider trong Firebase Console.';
            case 'auth/popup-closed-by-user': return 'Đã hủy đăng nhập Google.';
            case 'auth/unauthorized-domain': return `Lỗi: Tên miền '${window.location.hostname}' chưa được cấp quyền.`;
            case 'auth/invalid-email': return 'Email không hợp lệ.';
            case 'auth/user-disabled': return 'Tài khoản này đã bị vô hiệu hóa.';
            case 'auth/user-not-found': return 'Không tìm thấy tài khoản với email này.';
            case 'auth/wrong-password': return 'Sai mật khẩu.'; 
            case 'auth/invalid-credential': return 'Thông tin đăng nhập không đúng.';
            case 'auth/email-already-in-use': return 'Email này đã được sử dụng.';
            case 'auth/weak-password': return 'Mật khẩu quá yếu (cần ít nhất 6 ký tự).';
            default: return 'Đăng nhập thất bại: ' + errCode;
        }
    };

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError('');
        try {
            await loginWithGoogle();
        } catch (err: any) {
            setError(mapAuthError(err.code));
            setIsLoading(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Vui lòng nhập đầy đủ Email và Mật khẩu.');
            return;
        }
        
        setIsLoading(true);
        setError('');
        
        try {
            if (isRegistering) {
                await registerWithEmail(email, password);
            } else {
                await loginWithEmail(email, password);
            }
            // Auth listener in App.tsx handles redirect
        } catch (err: any) {
            setError(mapAuthError(err.code));
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-r from-pru-red to-red-700 transform skew-y-[-6deg] origin-top-left -translate-y-20 z-0"></div>
            
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative z-10 animate-fade-in border border-gray-100">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-red-50 text-pru-red rounded-full flex items-center justify-center mx-auto mb-3 text-2xl border-4 border-white shadow-lg">
                        <i className="fas fa-shield-alt"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-1">TuanChom</h1>
                    <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Smart Insurance Assistant</p>
                </div>

                <div className="space-y-4">
                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex flex-col gap-1 border border-red-100 break-words animate-pulse">
                            <div className="flex items-center font-bold">
                                <i className="fas fa-exclamation-circle mr-2"></i> Lỗi
                            </div>
                            <p>{error}</p>
                            {error.includes('Provider') && (
                                <p className="mt-1 italic opacity-80">Gợi ý: Vào Firebase Console -&gt; Authentication -&gt; Sign-in method -&gt; Bật Email/Password.</p>
                            )}
                        </div>
                    )}

                    {/* Email/Password Form */}
                    <form onSubmit={handleEmailAuth} className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Email</label>
                            <div className="relative">
                                <i className="fas fa-envelope absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                <input 
                                    type="email" 
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-pru-red focus:ring-1 focus:ring-pru-red transition-all"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Mật khẩu</label>
                            <div className="relative">
                                <i className="fas fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                <input 
                                    type="password" 
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-pru-red focus:ring-1 focus:ring-pru-red transition-all"
                                    placeholder="••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-pru-red text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-red-500/30 hover:bg-red-700 transition flex items-center justify-center group mt-2"
                        >
                            {isLoading ? (
                                <i className="fas fa-spinner fa-spin"></i>
                            ) : (
                                <span>{isRegistering ? 'Đăng ký tài khoản' : 'Đăng nhập'}</span>
                            )}
                        </button>
                    </form>

                    <div className="flex justify-center">
                        <button 
                            type="button"
                            onClick={() => { setError(''); setIsRegistering(!isRegistering); }}
                            className="text-xs text-blue-600 hover:underline font-medium"
                        >
                            {isRegistering 
                                ? 'Đã có tài khoản? Đăng nhập ngay' 
                                : 'Chưa có tài khoản? Đăng ký mới'}
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-2 bg-white text-xs text-gray-400">Hoặc tiếp tục với</span>
                        </div>
                    </div>

                    {/* Google Login */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="w-full bg-white border border-gray-300 text-gray-700 font-bold py-2.5 px-4 rounded-xl shadow-sm hover:bg-gray-50 transition flex items-center justify-center"
                    >
                        <img 
                            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                            alt="Google" 
                            className="w-5 h-5 mr-2"
                        />
                        <span className="text-sm">Google</span>
                    </button>
                </div>

                <div className="mt-6 text-center text-[10px] text-gray-400">
                    &copy; {new Date().getFullYear()} Prudential Assistant System.<br/>
                    Bảo mật dữ liệu là ưu tiên hàng đầu.
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
