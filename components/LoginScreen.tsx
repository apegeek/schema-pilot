
import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, Lock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface LoginScreenProps {
  onLogin: (password: string) => boolean;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const bgUrl = new URL('../assets/images/bg.jpeg', import.meta.url).href;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = onLogin(password);
    if (!success) {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div
      className="min-h-screen relative flex flex-col items-center justify-center text-gray-200"
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(1, 1, 1, 0.45)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}
      ></div>
      <div className="w-full max-w-md p-8 bg-flyway-panel border border-flyway-border rounded-lg shadow-2xl relative overflow-hidden z-10">
        
        {/* Decorative background element */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 ring-2 ring-gray-700 shadow-lg">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t.login.title}</h1>
          <p className="text-sm text-gray-500 mt-2">{t.login.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t.login.label_password}
            </label>
            <div className="relative group">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className={`w-full bg-[#151515] border ${error ? 'border-red-500' : 'border-flyway-border'} rounded p-2 pl-9 text-sm text-gray-200 focus:border-blue-500 focus:outline-none transition-all`}
                placeholder={t.login.placeholder}
                autoFocus
              />
            </div>
            {error && (
              <p className="text-xs text-red-500 animate-pulse">{t.login.error_password}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 group"
          >
            {t.login.btn_login}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-flyway-border text-center">
          <p className="text-[10px] text-gray-600">
            {t.login.footer_default} <code className="text-gray-500 bg-gray-800 px-1 py-0.5 rounded">admin</code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
