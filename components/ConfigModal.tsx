
import React, { useState, useEffect } from 'react';
import { DbConfig, DbType } from '../types';
import { X, Database, FolderOpen, Server, Key, Shield, CheckCircle2, AlertTriangle, Layers, Zap, BrainCircuit, FileText } from 'lucide-react';
import { dbService } from '../services/dbService';
import { useLanguage } from '../contexts/LanguageContext';

interface ConfigModalProps {
  isOpen: boolean;
  config: DbConfig;
  onSave: (config: DbConfig) => void;
  onClose: () => void;
}

const DEFAULT_PORTS: Record<DbType, string> = {
  MySQL: '3306',
  PostgreSQL: '5432',
  MariaDB: '3306',
  Oracle: '1521'
};

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, config, onSave, onClose }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<DbConfig>(config);
  const [activeSection, setActiveSection] = useState<'db' | 'redis' | 'ai' | 'security'>('db');
  
  // Connection Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'none' | 'success' | 'error'>('none');
  const [testMessage, setTestMessage] = useState('');
  const [isRedisTesting, setIsRedisTesting] = useState(false);
  const [redisTestStatus, setRedisTestStatus] = useState<'none' | 'success' | 'error'>('none');
  const [redisTestMessage, setRedisTestMessage] = useState('');
  const [isAiTesting, setIsAiTesting] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState<'none' | 'success' | 'error'>('none');
  const [aiTestMessage, setAiTestMessage] = useState('');
  

  // Sync internal state with props when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(config);
      setActiveSection('db');
      setTestStatus('none');
      setAiTestStatus('none');
      setAiTestMessage('');
    }
  }, [isOpen, config]);

  

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setTestStatus('none'); // Reset test status on change
  };

  const handleRedisChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      redis: {
        ...prev.redis!,
        [name]: type === 'checkbox' ? checked : value
      }
    }));
    setRedisTestStatus('none');
  };

  const handleAiChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const prevAi = prev.ai || { provider: 'Gemini', model: 'gemini-2.5-flash', apiKey: '' };
      let nextAi = { ...prevAi, [name]: value };
      if (name === 'provider') {
        const isSwitchToDeepSeek = value === 'DeepSeek';
        const isSwitchToGemini = value === 'Gemini';
        const currentModel = (prevAi.model || '').trim();
        const looksGemini = /gemini/i.test(currentModel);
        const looksDeepSeek = /deepseek/i.test(currentModel);
        if (!currentModel) {
          nextAi.model = isSwitchToDeepSeek ? 'deepseek-reasoner' : 'gemini-2.5-flash';
        } else if (isSwitchToDeepSeek && looksGemini) {
          nextAi.model = 'deepseek-reasoner';
        } else if (isSwitchToGemini && looksDeepSeek) {
          nextAi.model = 'gemini-2.5-flash';
        }
      }
      return { ...prev, ai: nextAi };
    });
  };

  const handleTestAi = async () => {
    setIsAiTesting(true);
    setAiTestMessage('');
    if (!formData.ai?.provider || !formData.ai?.model || !formData.ai?.apiKey) {
      setIsAiTesting(false);
      setAiTestStatus('error');
      setAiTestMessage(t.config.ai_test_fail);
      return;
    }
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: formData, script: { name: 'healthcheck.sql', content: 'SELECT 1;' } })
      });
      const data = await res.json();
      if (res.ok && (data as any)?.ok) {
        setAiTestStatus('success');
      } else {
        setAiTestStatus('error');
        setAiTestMessage(String((data as any)?.error || t.config.ai_test_fail));
      }
    } catch (e: any) {
      setAiTestStatus('error');
      setAiTestMessage(String(e?.message || t.config.ai_test_fail));
    } finally {
      setIsAiTesting(false);
    }
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as DbType;
    setFormData(prev => ({
      ...prev,
      type: newType,
      port: DEFAULT_PORTS[newType] // Auto-fill port
    }));
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestMessage('');
    try {
      const res = await fetch('/api/db-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          host: formData.host,
          port: formData.port,
          database: formData.database,
          user: formData.user,
          password: formData.password,
          schema: formData.schema
        })
      });
      const data = await res.json();
      setIsTesting(false);
      if (res.ok && data.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestMessage(String(data.error || 'Connection failed'));
      }
    } catch (e: any) {
      setIsTesting(false);
      setTestStatus('error');
      setTestMessage(String(e?.message || 'Connection failed'));
    }
  };

  const handleTestRedis = async () => {
    if (!formData.redis?.enabled) return;
    setIsRedisTesting(true);
    setRedisTestMessage('Ping...');
    try {
      const res = await fetch('/api/redis-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: formData.redis?.host,
          port: formData.redis?.port,
          password: formData.redis?.password,
          dbIndex: formData.redis?.dbIndex
        })
      });
      const data = await res.json();
      setIsRedisTesting(false);
      if (res.ok && data.ok) {
        setRedisTestStatus('success');
        setRedisTestMessage('OK');
      } else {
        setRedisTestStatus('error');
        setRedisTestMessage(String(data.error || 'Failed'));
      }
    } catch (e: any) {
      setIsRedisTesting(false);
      setRedisTestStatus('error');
      setRedisTestMessage(String(e?.message || 'Failed'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-flyway-panel w-[750px] h-[600px] border border-flyway-border rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-flyway-border">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            {t.config.title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-flyway-border bg-black/20">
           <button 
             onClick={() => setActiveSection('db')}
             className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeSection === 'db' ? 'border-blue-500 text-blue-400 bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
           >
             <Server className="w-3.5 h-3.5" />
             {t.config.tab_db}
           </button>
           <button 
             onClick={() => setActiveSection('redis')}
             className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeSection === 'redis' ? 'border-red-500 text-red-400 bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
           >
             <Layers className="w-3.5 h-3.5" />
             {t.config.tab_redis}
           </button>
          <button 
            onClick={() => setActiveSection('ai')}
            className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeSection === 'ai' ? 'border-yellow-500 text-yellow-400 bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            {t.config.tab_ai}
          </button>
          
           <button 
             onClick={() => setActiveSection('security')}
             className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeSection === 'security' ? 'border-purple-500 text-purple-400 bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
           >
             <Shield className="w-3.5 h-3.5" />
             {t.config.tab_security}
           </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 p-6 overflow-y-auto">
          
          {activeSection === 'db' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.db_type}</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleTypeChange}
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="MySQL">MySQL</option>
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="MariaDB">MariaDB</option>
                    <option value="Oracle">Oracle</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.db_schema}</label>
                  <input
                    type="text"
                    name="schema"
                    value={formData.schema}
                    onChange={handleChange}
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8 space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2">
                      <Zap className="w-3 h-3 text-yellow-500" /> {t.config.db_host}
                    </label>
                    <input
                      type="text"
                      name="host"
                      value={formData.host}
                      onChange={handleChange}
                      className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                    />
                </div>
                <div className="col-span-4 space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2">
                      <Server className="w-3 h-3" /> {t.config.db_port}
                    </label>
                    <input
                      type="text"
                      name="port"
                      value={formData.port}
                      onChange={handleChange}
                      className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none font-mono"
                    />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-4 space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase h-4 flex items-center gap-2">{t.config.db_name}</label>
                  <input
                    type="text"
                    name="database"
                    value={formData.database}
                    onChange={handleChange}
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase h-4 flex items-center gap-2">{t.config.db_user}</label>
                  <input
                    type="text"
                    name="user"
                    value={formData.user}
                    onChange={handleChange}
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2 h-4">
                    <Key className="w-3 h-3" /> {t.config.db_pass}
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••"
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-flyway-border">
                <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2 mt-2">
                  <FolderOpen className="w-3 h-3" />
                  {t.config.fs_path}
                </label>
                <input
                  type="text"
                  name="scriptsPath"
                  value={formData.scriptsPath}
                  onChange={handleChange}
                  className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>

              {/* Test Connection Area */}
              <div className="mt-4 flex items-center justify-between bg-black/20 p-3 rounded border border-flyway-border">
                <div className="text-xs text-gray-400">
                  {testStatus === 'none' && !isTesting && t.config.test_idle}
                  {isTesting && <span className="text-blue-400 animate-pulse">{t.config.testing}</span>}
                  {testStatus === 'success' && (
                    <span className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      {t.config.test_success}
                    </span>
                  )}
                  {testStatus === 'error' && (
                    <span className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      {testMessage || t.config.test_fail}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className={`px-3 py-1.5 text-xs font-bold rounded border transition-all
                    ${isTesting ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-wait' : 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:text-white text-gray-300'}
                  `}
                >
                  {isTesting ? t.config.testing : t.config.test_btn}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'redis' && (
            <div className="space-y-6 py-2">
              <div className="flex items-center justify-between bg-red-900/10 border border-red-900/30 p-3 rounded">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded text-red-500">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-red-200">{t.config.redis_enable}</h3>
                      <p className="text-xs text-gray-400">{t.config.redis_desc}</p>
                    </div>
                 </div>
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" name="enabled" checked={formData.redis?.enabled} onChange={handleRedisChange} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                 </label>
              </div>

              <div className={`space-y-5 transition-opacity ${formData.redis?.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                 <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-9 space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.redis_host}</label>
                        <input
                          type="text"
                          name="host"
                          value={formData.redis?.host || ''}
                          onChange={handleRedisChange}
                          className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-red-500 focus:outline-none font-mono"
                          placeholder="127.0.0.1"
                        />
                    </div>
                    <div className="col-span-3 space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.redis_port}</label>
                        <input
                          type="text"
                          name="port"
                          value={formData.redis?.port || ''}
                          onChange={handleRedisChange}
                          className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-red-500 focus:outline-none font-mono"
                          placeholder="6379"
                        />
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.redis_pass}</label>
                    <input
                      type="password"
                      name="password"
                      value={formData.redis?.password || ''}
                      onChange={handleRedisChange}
                      className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-red-500 focus:outline-none font-mono"
                      placeholder="••••••••"
                    />
                 </div>

                 <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.redis_db}</label>
                    <input
                      type="number"
                      name="dbIndex"
                      value={formData.redis?.dbIndex || 0}
                      onChange={handleRedisChange}
                      className="w-24 bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-red-500 focus:outline-none font-mono"
                    />
                </div>

                <div className="mt-2 flex items-center justify-between bg-black/20 p-3 rounded border border-flyway-border">
                  <div className="text-xs text-gray-400">
                    {redisTestStatus === 'none' && !isRedisTesting && t.config.redis_test_idle}
                    {isRedisTesting && <span className="text-red-400 animate-pulse">{t.config.redis_testing}</span>}
                    {redisTestStatus === 'success' && (
                      <span className="flex items-center gap-2 text-green-400">
                        <CheckCircle2 className="w-4 h-4" />
                        {t.config.redis_test_success}
                      </span>
                    )}
                    {redisTestStatus === 'error' && (
                      <span className="flex items-center gap-2 text-red-400">
                        <AlertTriangle className="w-4 h-4" />
                        {redisTestMessage || t.config.redis_test_fail}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleTestRedis}
                    disabled={isRedisTesting || !formData.redis?.enabled}
                    className={`px-3 py-1.5 text-xs font-bold rounded border transition-all
                      ${isRedisTesting ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-wait' : 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:text-white text-gray-300'}
                    `}
                  >
                    {isRedisTesting ? t.config.redis_testing : t.config.redis_test_btn}
                  </button>
                </div>
              </div>
            </div>
          )}

          

          {activeSection === 'ai' && (
            <div className="space-y-6 py-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.ai_provider}</label>
                    <select
                      name="provider"
                      value={formData.ai?.provider || 'Gemini'}
                      onChange={handleAiChange}
                      className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-yellow-500 focus:outline-none"
                    >
                      <option value="Gemini">Gemini</option>
                      <option value="DeepSeek">DeepSeek</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.ai_model}</label>
                    <input
                      type="text"
                      name="model"
                      value={formData.ai?.model || ''}
                      onChange={handleAiChange}
                      className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-yellow-500 focus:outline-none font-mono"
                      placeholder="gemini-2.5-flash / deepseek-reasoner"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase">{t.config.ai_api_key}</label>
                  <input
                    type="password"
                    name="apiKey"
                    value={formData.ai?.apiKey || ''}
                    onChange={handleAiChange}
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200 focus:border-yellow-500 focus:outline-none font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between bg-black/20 p-3 rounded border border-flyway-border">
                <div className="text-xs text-gray-400">
                  {aiTestStatus === 'none' && t.config.ai_test_idle}
                  {isAiTesting && <span className="text-yellow-400 animate-pulse">{t.config.ai_testing}</span>}
                  {aiTestStatus === 'success' && !isAiTesting && (
                    <span className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      {t.config.ai_test_success}
                    </span>
                  )}
                  {aiTestStatus === 'error' && !isAiTesting && (
                    <span className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      {aiTestMessage || t.config.ai_test_fail}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleTestAi}
                  disabled={isAiTesting}
                  className={`px-3 py-1.5 text-xs font-bold rounded border transition-all ${isAiTesting ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-wait' : 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:text-white text-gray-300'}`}
                >
                  {isAiTesting ? t.config.ai_testing : t.config.ai_test_btn}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6 py-4">
               <div className="bg-amber-900/20 border border-amber-600/30 p-4 rounded text-amber-200 text-xs flex gap-3">
                 <Shield className="w-5 h-5 shrink-0" />
                 <div>
                   <p className="font-bold mb-1">{t.config.sec_title}</p>
                   <p className="opacity-80">{t.config.sec_desc}</p>
                 </div>
               </div>

               <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-2">
                    <Key className="w-3 h-3" /> {t.config.sec_label}
                  </label>
                  <input
                    type="text"
                    name="appPassword"
                    value={formData.appPassword || ''}
                    onChange={handleChange}
                    className="w-full bg-[#1e1e1e] border border-flyway-border rounded p-3 text-sm text-gray-200 focus:border-purple-500 focus:outline-none font-mono"
                    placeholder="admin"
                  />
                  <p className="text-[10px] text-gray-500">{t.config.sec_hint}</p>
               </div>
            </div>
          )}

          <div className="pt-1 mt-2 border-flyway-border flex justify-end gap-3">
             <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
               {t.config.btn_cancel}
             </button>
             <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium shadow-lg transition-colors">
               {t.config.btn_save}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigModal;
