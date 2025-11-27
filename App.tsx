
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Sidebar from './components/Sidebar';
import ScriptEditor from './components/ScriptEditor';
import LogPanel from './components/LogPanel';
import ConfigModal from './components/ConfigModal';
import HistoryTable from './components/HistoryTable';
import LoginScreen from './components/LoginScreen';
import { ScriptFile, DbConfig, LogEntry, MigrationStatus, HistoryRecord } from './types';
import { PanelBottom, GripVertical, GripHorizontal, Save, X, ChevronRight, ChevronsLeft } from 'lucide-react';
import Resizer from './components/Resizer';
import { cacheService } from './services/cacheService';
import { dbService } from './services/dbService';
import { useLanguage } from './contexts/LanguageContext';

const App: React.FC = () => {
  // Load saved config on boot
  const [config, setConfig] = useState<DbConfig>(cacheService.getConfig());
  const { t } = useLanguage();
  
  // Data States
  const [scripts, setScripts] = useState<ScriptFile[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  
  // UI States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<'scripts' | 'history'>('scripts');
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [migratingId, setMigratingId] = useState<string | null>(null);
  
  // Loading States
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(420);
  const [editorWidth, setEditorWidth] = useState<number>(520);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const [isEditorFull, setIsEditorFull] = useState(false);
  const [logHeight, setLogHeight] = useState<number>(192);
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [genDesc, setGenDesc] = useState("");
  const [genOut, setGenOut] = useState("");
  const [genErr, setGenErr] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [modalCollapsed, setModalCollapsed] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [pendingGenPayload, setPendingGenPayload] = useState<{ defaultName: string; payload: string } | null>(null);

  useEffect(() => {
    const auth = cacheService.getAuthToken();
    if (auth) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    setIsSidebarCollapsed(userCollapsed || modalCollapsed);
  }, [userCollapsed, modalCollapsed]);

  useEffect(() => {
    const local = cacheService.getConfig();
    if (local?.redis?.enabled) {
      dbService.getGlobalConfig(local.redis).then((remote) => {
        if (remote) {
          setConfig(remote);
          addLog('INFO', 'Loaded global config from Redis.');
        } else {
          addLog('WARN', 'Redis global config not found; using local config.');
        }
      }).catch(() => {
        addLog('ERROR', 'Failed to load global config from Redis.');
      });
    }
  }, []);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level,
      message
    }]);
  }, []);

  // --- Data Loading Strategy ---
  const loadData = useCallback(async (currentConfig: DbConfig) => {
    setIsLoadingData(true);
    
    try {
      if (currentConfig.redis?.enabled) {
        const cached = await dbService.fetchHistoryFromCache(currentConfig.redis);
        if (Array.isArray(cached) && cached.length) {
          setHistory(cached);
          addLog('INFO', `Redis Cache: Loaded ${cached.length} records from cache.`);
        }
      }
    } catch {}

    // 1. Always load History from DB (no cache)
    try {
      const freshHistory = await dbService.fetchHistoryFromDb(currentConfig);
      setHistory(freshHistory);
      addLog('INFO', `Database Query: Fetched ${freshHistory.length} records from flyway_schema_history.`);
    } catch (e) {
      addLog('ERROR', 'Failed to query database.');
      setHistory([]);
    }

    // 2. Always load Scripts from filesystem path (no cache)
    try {
      const freshScripts = await dbService.fetchScriptsFromPath(currentConfig.scriptsPath);
      setScripts(freshScripts);
      addLog('INFO', `Filesystem Scan: Loaded ${freshScripts.length} scripts from ${currentConfig.scriptsPath}.`);
    } catch (e) {
      addLog('ERROR', 'Failed to read scripts from path.');
      setScripts([]);
    }

    setIsLoadingData(false);
  }, [addLog]);

  // Initial Load after Login
  useEffect(() => {
    if (isAuthenticated) {
      addLog('INFO', 'System authenticated.');
      loadData(config);
    }
  }, [isAuthenticated, config.type, config.host, config.port, config.database, config.schema, config.scriptsPath, loadData]);

  // Persist global config changes
  useEffect(() => {
    cacheService.saveConfig(config);
  }, [config]);

  // Core Logic: Compare Filesystem Scripts vs DB History (Run whenever either changes)
  useEffect(() => {
    if (!isAuthenticated) return;

    setScripts(prevScripts => {
      let hasChanges = false;
      const updated = prevScripts.map(script => {
        const historyRecord = history.find(h => {
          const hs = (h.script || '').toLowerCase();
          const sn = (script.name || '').toLowerCase();
          if (hs === sn) return true;
          if (h.version && script.version && String(h.version) === String(script.version)) return true;
          return false;
        });
        
        let newStatus = MigrationStatus.PENDING;
        let installedOn = undefined;
        let executionTime = undefined;

        if (historyRecord) {
           if (historyRecord.success) {
             newStatus = MigrationStatus.SUCCESS;
             installedOn = historyRecord.installed_on;
             executionTime = historyRecord.execution_time;
           } else {
             newStatus = MigrationStatus.FAILED;
           }
        }

        if (script.status !== newStatus || script.installedOn !== installedOn) {
           hasChanges = true;
           return { ...script, status: newStatus, installedOn, executionTime };
        }
        return script;
      });

      return hasChanges ? updated : prevScripts;
    });
  }, [history, scripts, isAuthenticated]);


  const handleLogin = (password: string) => {
    const validPassword = config.appPassword || 'admin';
    if (password === validPassword) {
      const token = Math.random().toString(36).slice(2);
      const expiresAt = Date.now() + 30 * 60 * 1000;
      cacheService.saveAuthToken(token, expiresAt);
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    cacheService.clearAuthToken();
    setIsAuthenticated(false);
    setSelectedScriptId(null);
  };

  const handleRefresh = () => {
    addLog('INFO', 'Manual Refresh Triggered.');
    loadData(config);
  };

  const handleOpenGen = () => {
    setIsGenOpen(true);
    setGenDesc('');
    setGenOut('');
    setGenErr('');
    setModalCollapsed(true);
  };
  const extractSqlBlocks = (md: string): string[] => {
    const blocks: string[] = [];
    const reBacktick = /```[\s\S]*?```/g;
    let m;
    while ((m = reBacktick.exec(md)) !== null) {
      const block = m[0];
      const lines = block.split('\n');
      if (lines.length >= 2) {
        const content = lines.slice(1, -1).join('\n').trim();
        if (content) blocks.push(content);
      } else {
        const content = block.replace(/^```\w*\s*/, '').replace(/```$/, '').trim();
        if (content) blocks.push(content);
      }
    }
    if (blocks.length) return blocks;
    const paras = md.split(/\n\s*\n/);
    const looksSqlStart = /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT|BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE|TRUNCATE|COMMENT|CONSTRAINT|FOREIGN KEY|PRIMARY KEY|REFERENCES|ADD CONSTRAINT|SET|VALUES|FROM|JOIN|WHERE)\b/i;
    return paras.filter(p => looksSqlStart.test(p.trim())).map(p => p.trim());
  };
  const handleGenerateSql = async () => {
    setGenErr('');
    setGenOut('');
    setGenLoading(true);
    try {
      const aiCfg = await dbService.getAiConfig(config.redis);
      const reqCfg: any = aiCfg ? { ...config, ai: aiCfg } : config;
      const res = await fetch('/api/ai/generate-sql/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: reqCfg, description: genDesc })
      });
      if (!res.body) {
        const out = await dbService.generateSql(reqCfg, genDesc);
        setGenOut(out);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split(/\r?\n/);
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.replace(/^data:\s*/, '');
            if (!raw || raw === '[DONE]') continue;
            let data = raw;
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed === 'string') data = parsed;
            } catch {}
            setGenOut(prev => prev + data);
          }
        }
      }
    } catch (e: any) {
      setGenErr(String(e?.message || 'Generate failed'));
    } finally {
      setGenLoading(false);
    }
  };
  const handleSaveGenerated = async () => {
    const existing = await dbService.fetchScriptsFromPath(config.scriptsPath);
    const parse = (v: string) => v.split('.').map(x => parseInt(x, 10)).map(n => isNaN(n) ? 0 : n);
    const cmp = (a: string, b: string) => {
      const A = parse(a);
      const B = parse(b);
      const len = Math.max(A.length, B.length);
      for (let i = 0; i < len; i++) { const ai = A[i] || 0, bi = B[i] || 0; if (ai !== bi) return ai - bi; }
      return 0;
    };
    const versions = existing.map(s => s.version).filter(v => typeof v === 'string' && v.trim().length > 0);
    let next = '1';
    if (versions.length) {
      const max = versions.sort(cmp).pop() as string;
      const arr = parse(max);
      if (!arr.length) arr.push(0);
      arr[arr.length - 1] += 1;
      next = arr.join('.');
    }
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const desc = slugify(genDesc || 'ai generated').replace(/-/g, '_');
    const defaultName = `V${next}__${desc}.sql`;
    const blocks = extractSqlBlocks(genOut);
    const payload = (blocks.length ? blocks.join('\n\n') : genOut).trim();
    setPendingGenPayload({ defaultName, payload });
    setNameInput(defaultName);
    setNameError('');
    setNameModalOpen(true);
    setModalCollapsed(true);
  };

  const handleSaveScript = async (id: string, newContent: string): Promise<boolean> => {
    const s = scripts.find(x => x.id === id);
    if (!s) return false;
    if (s.status !== MigrationStatus.PENDING) {
      addLog('WARN', 'Save blocked: only pending scripts can be edited.');
      return false;
    }
    const res = await dbService.saveScriptContent(config.scriptsPath, s.path || '', s.name, newContent);
    if (res.ok) {
      const updated = scripts.map(x => x.id === id ? { ...x, content: newContent } : x);
      setScripts(updated);
      cacheService.saveScripts(config.scriptsPath, updated, config);
      addLog('SUCCESS', `Saved script: ${s.name}`);
      return true;
    } else {
      addLog('ERROR', `Failed to save script: ${s.name} (${res.error})`);
      return false;
    }
  };

  const handleMigrate = async (id: string) => {
    const script = scripts.find(s => s.id === id);
    if (!script) return;
    const statements = String(script.content || '').split(/;[\r\n]*/).map(s => s.trim()).filter(Boolean);
    const looksDanger = statements.some(st => {
      const s = st.toLowerCase();
      if (/\bdrop\s+(table|index|view|schema)\b/i.test(st)) return true;
      if (/\btruncate\b/i.test(st)) return true;
      if (/\balter\s+table[\s\S]*\bdrop\b/i.test(st)) return true;
      if (/\bdelete\b/i.test(st) && !/\bwhere\b/i.test(st)) return true;
      if (/\bupdate\b/i.test(st) && !/\bwhere\b/i.test(st)) return true;
      if (/\block\s+table\b/i.test(st)) return true;
      return false;
    });
    if (looksDanger) {
      const ok = window.confirm('检测到可能存在破坏性操作（DROP/TRUNCATE/无 WHERE 的 UPDATE/DELETE 等）。确认继续执行迁移吗？');
      if (!ok) { addLog('WARN', '执行已取消：检测到高风险 SQL。'); return; }
    }

    setMigratingId(id);
    addLog('INFO', `Connecting to ${config.host}...`);
    addLog('INFO', `Executing migration: ${script.name}`);
    
    const started = Date.now();
    try {
      const res = await dbService.executeMigration(config, { name: script.name, content: script.content });
      if (!res.ok) {
        addLog('ERROR', `Migration failed: ${res.error || 'Unknown error'}`);
      } else {
        const ms = Date.now() - started;
        addLog('SUCCESS', `Migration executed successfully in ${ms}ms.`);
        if (res.historyError) {
          addLog('WARN', `Migration executed but history table update failed: ${res.historyError}`);
        }
        await loadData(config);
      }
    } catch (e) {
      addLog('ERROR', `Migration failed: ${(e as Error).message}`);
    } finally {
      setMigratingId(null);
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const selectedScript = scripts.find(s => s.id === selectedScriptId);

  return (
    <div className="flex h-screen overflow-hidden bg-[#1e1e1e] relative">
      <div
        style={{ width: isSidebarCollapsed ? 0 : sidebarWidth, transition: 'width 240ms ease' }}
        className="shrink-0 overflow-hidden"
        aria-hidden={isSidebarCollapsed}
      >
        <Sidebar 
          scripts={scripts} 
          config={config} 
          selectedScriptId={selectedScriptId}
          currentView={currentView}
          onSelectScript={(id) => { setSelectedScriptId(id); setCurrentView('scripts'); }}
          onChangeView={setCurrentView}
          onOpenConfig={() => setIsConfigOpen(true)}
          onRefresh={handleRefresh}
          onLogout={handleLogout}
          isLoading={isLoadingData}
            onCollapse={() => setUserCollapsed(true)}
        />
        </div>
      {!isSidebarCollapsed && (
        <Resizer
          orientation="vertical"
          className="w-3 bg-flyway-border/50 hover:bg-white/10 cursor-col-resize select-none"
          title={t.sidebar.resize_tooltip}
          onDrag={(dx) => setSidebarWidth(clamp(sidebarWidth + dx, 260, 560))}
        />
      )}
      {/* Floating toggle button (top overlay), does not interfere with drag */}
      <button
        onClick={() => setUserCollapsed(!userCollapsed)}
        className="absolute p-0 bg-transparent outline-none text-orange-300 hover:text-orange-200 transition-transform duration-200 glow-toggle"
        title={isSidebarCollapsed ? t.sidebar.expand_tooltip : t.sidebar.collapse_tooltip}
        style={{ left: (isSidebarCollapsed ? 8 : sidebarWidth - 10), top: 120, zIndex: 60, transition: 'left 240ms ease, transform 160ms ease' }}
        onMouseEnter={(e) => { (e.currentTarget.style.transform = 'scale(1.06)'); }}
        onMouseLeave={(e) => { (e.currentTarget.style.transform = 'scale(1)'); }}
        aria-label={isSidebarCollapsed ? t.sidebar.expand_tooltip : t.sidebar.collapse_tooltip}
      >
        {isSidebarCollapsed ? <ChevronRight className="w-5 h-5 glow-icon-orange" /> : <ChevronsLeft className="w-5 h-5 glow-icon-orange" />}
      </button>
      <style>{`
        @keyframes iconGlowOrange {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(255, 158, 0, 0.35)) drop-shadow(0 0 12px rgba(255, 158, 0, 0.18)); }
          50% { filter: drop-shadow(0 0 7px rgba(255, 158, 0, 0.55)) drop-shadow(0 0 18px rgba(255, 158, 0, 0.28)); }
        }
        .glow-icon-orange { animation: iconGlowOrange 1.8s ease-in-out infinite; }
        @keyframes haloPulseOrange {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.08); }
        }
        .glow-toggle::after {
          content: '';
          position: absolute;
          left: -18px; top: -18px; right: -18px; bottom: -18px;
          border-radius: 9999px;
          background: radial-gradient(closest-side, rgba(255, 158, 0, 0.28), rgba(255, 158, 0, 0));
          filter: blur(2px);
          pointer-events: none;
          animation: haloPulseOrange 1.8s ease-in-out infinite;
        }
        .no-select *, .no-select { user-select: none !important; }
      `}</style>
      <div className="flex-1 flex flex-col min-w-0" ref={columnRef}>
        <div className="flex flex-1 min-w-0 overflow-hidden" ref={mainRef}>
          {isEditorFull ? (
            <div className="flex-1 bg-[#1e1e1e]">
              {selectedScript ? (
                <ScriptEditor 
                  script={selectedScript} 
                  onSave={handleSaveScript}
                  onMigrate={handleMigrate}
                  isMigrating={migratingId === selectedScript.id}
                  scriptsPath={config.scriptsPath}
                  onUploadComplete={() => handleRefresh()}
                  onToggleFullScreen={() => setIsEditorFull(false)}
                  onRequestCollapseSidebar={(c) => setModalCollapsed(c)}
                  isFullScreen
                />
              ) : (
                <div className="flex flex-col h-full bg-[#1e1e1e]">
                  <div className="flex flex-col gap-2 p-3 border-b border-flyway-border bg-flyway-panel">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleOpenGen}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-purple-700 hover:bg-purple-600 text-white"
                      >
                        {t.editor.gen_open}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center text-gray-500 select-none bg-[#1e1e1e] flex-col">
                    <div className="w-24 h-24 rounded-full bg-gray-800/50 flex items-center justify-center mb-6">
                      <PanelBottom className="w-10 h-10 opacity-30" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-400 mb-2">{t.editor.no_selection_title}</h3>
                    <p className="text-sm text-gray-600 max-w-sm text-center">{t.editor.no_selection_desc}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-[420px] border-r border-flyway-border bg-[#1e1e1e]">
                <HistoryTable history={history} />
              </div>
              <Resizer
                orientation="vertical"
                className="w-3 bg-flyway-border/50 hover:bg-white/10 cursor-col-resize select-none"
                title={t.sidebar.resize_tooltip}
                onDrag={(dx) => {
                  const rect = mainRef.current?.getBoundingClientRect();
                  const limit = rect ? Math.min(900, rect.width - 420) : 900;
                  setEditorWidth(clamp(editorWidth - dx, 320, limit));
                }}
              />
              <div style={{ width: editorWidth }} className="min-w-[360px] bg-[#1e1e1e]">
                {selectedScript ? (
                  <ScriptEditor 
                    script={selectedScript} 
                    onSave={handleSaveScript}
                    onMigrate={handleMigrate}
                    isMigrating={migratingId === selectedScript.id}
                    scriptsPath={config.scriptsPath}
                    onUploadComplete={() => handleRefresh()}
                    onToggleFullScreen={() => setIsEditorFull(true)}
                    onRequestCollapseSidebar={(c) => setModalCollapsed(c)}
                  />
                ) : (
                  <div className="flex flex-col h-full bg-[#1e1e1e]">
                    <div className="flex flex-col gap-2 p-3 border-b border-flyway-border bg-flyway-panel">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleOpenGen}
                          className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-purple-700 hover:bg-purple-600 text-white"
                        >
                          {t.editor.gen_open}
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center text-gray-500 select-none bg-[#1e1e1e] flex-col">
                      <div className="w-24 h-24 rounded-full bg-gray-800/50 flex items-center justify-center mb-6">
                        <PanelBottom className="w-10 h-10 opacity-30" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-400 mb-2">{t.editor.no_selection_title}</h3>
                      <p className="text-sm text-gray-600 max-w-sm text-center">{t.editor.no_selection_desc}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {!isLogOpen && (
          <div className="bg-flyway-dark border-t border-flyway-border px-4 py-1 flex justify-end shrink-0">
             <button onClick={() => setIsLogOpen(true)} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white">
                <PanelBottom className="w-4 h-4" />
                {t.logs.title}
             </button>
          </div>
        )}
        {isLogOpen && (
          <Resizer
            orientation="horizontal"
            className="h-2 bg-flyway-border/50 hover:bg-white/10 cursor-row-resize select-none"
            title={t.logs.resize_tooltip}
            onDrag={(dy) => setLogHeight(clamp(logHeight - dy, 120, 480))}
          />
        )}
        <LogPanel 
          logs={logs} 
          isOpen={isLogOpen} 
          onClose={() => setIsLogOpen(false)} 
          onClear={() => setLogs([])}
          height={logHeight}
        />
      </div>
      <ConfigModal 
        isOpen={isConfigOpen} 
        config={config} 
        onClose={() => setIsConfigOpen(false)} 
        onSave={(newConfig) => {
          const wasEnabled = Boolean(config.redis?.enabled);
          const nowEnabled = Boolean(newConfig.redis?.enabled);

          if (wasEnabled && !nowEnabled) {
            dbService.getGlobalConfig(config.redis).then(remote => {
              dbService.getAiConfig(config.redis).then(aiRemote => {
                let merged = remote
                  ? { ...remote, ...newConfig, ai: aiRemote || remote?.ai || newConfig.ai }
                  : { ...newConfig, ai: aiRemote || newConfig.ai };
                if (remote) {
                  merged = {
                    ...merged,
                    redis: {
                      ...(remote?.redis || {}),
                      ...(newConfig.redis || {}),
                      enabled: false
                    }
                  };
                } else if (newConfig.redis) {
                  merged = {
                    ...merged,
                    redis: { ...newConfig.redis, enabled: false }
                  };
                }
                setConfig(merged);
                cacheService.saveConfig(merged);
                addLog('INFO', 'Redis disabled. Migrated latest config from Redis to local storage.');
                if (isAuthenticated) loadData(merged);
              });
            });
          } else {
            setConfig(newConfig);
            addLog('INFO', 'Configuration updated. Initiating reload...');
            if (isAuthenticated) loadData(newConfig);
          }

          dbService.saveAiConfig(newConfig).then(ok => {
            if (ok) addLog('SUCCESS', 'AI configuration saved to Redis.');
            else addLog('WARN', 'AI configuration not saved (Redis disabled or error).');
          });
          dbService.saveGlobalConfig(newConfig).then(ok => {
            if (ok) addLog('SUCCESS', 'Global configuration saved to Redis.');
            else addLog('WARN', 'Global configuration not saved (Redis disabled or error).');
          });
        }}
      />
      {isGenOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-[#1e1e1e] w-[750px] h-[600px] border border-flyway-border rounded-lg shadow-xl overflow-hidden">
            <div className="p-4 border-b border-flyway-border text-gray-200 font-semibold">{t.editor.gen_title}</div>
            <div className="p-4 h-[540px]">
              <div className="grid grid-cols-2 gap-3 h-full min-h-0">
                <div className="flex flex-col min-h-0">
                  <label className="text-xs text-gray-400 mb-1">{t.editor.gen_desc_label}</label>
                  <textarea
                    value={genDesc}
                    onChange={(e) => setGenDesc(e.target.value)}
                    className="w-full flex-1 bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200"
                    placeholder={t.editor.gen_desc_placeholder}
                  />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => { setIsGenOpen(false); setModalCollapsed(false); }} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{t.editor.gen_cancel}</button>
              <button onClick={handleGenerateSql} disabled={genLoading || !genDesc.trim()} className={`px-3 py-1.5 text-xs rounded ${genLoading ? 'bg-purple-800 text-gray-300' : 'bg-purple-700 text-white hover:bg-purple-600'} border border-purple-600`}>{t.editor.gen_generate}</button>
            </div>
                  {genErr && <div className="mt-2 text-xs text-red-400">{genErr}</div>}
                </div>
                <div className="flex flex-col min-h-0">
                  <div className="text-xs text-gray-400 mb-1">{t.editor.gen_output_title}</div>
                  <div className="flex-1 min-h-0 bg-black/30 border border-flyway-border rounded overflow-hidden">
                    <div className="h-full overflow-y-auto p-2 text-xs">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: ({ inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            if (!inline) {
                              const text = Array.isArray(children) ? String(children[0]).replace(/\n$/, '') : String(children).replace(/\n$/, '');
                              return (
                                <SyntaxHighlighter
                                  {...props}
                                  PreTag="div"
                                  language={(match?.[1]) || 'sql'}
                                  style={vscDarkPlus}
                                  wrapLongLines
                                >
                                  {text}
                                </SyntaxHighlighter>
                              );
                            }
                            return <code className={className} {...props}>{children}</code>;
                          }
                        }}
                      >
                        {genOut}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button onClick={handleSaveGenerated} disabled={!genOut.trim()} className="px-3 py-1.5 text-xs rounded bg-green-700 text-white border border-green-600 hover:bg-green-600">{t.editor.gen_save}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {nameModalOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1e1e1e] w-[520px] border border-flyway-border rounded-lg shadow-xl">
            <div className="p-3 border-b border-flyway-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-300 font-semibold">
                <Save className="w-4 h-4" />
                {t.editor.gen_save}
              </div>
              <button onClick={() => { setNameModalOpen(false); setNameError(''); setModalCollapsed(false); }} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-xs text-gray-400">V&lt;version&gt;__&lt;description&gt;.sql</div>
              <input
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setNameError(''); }}
                className="w-full bg-black/20 border border-flyway-border rounded p-2 text-xs text-gray-300 font-mono"
              />
              {nameError && <div className="text-xs text-red-400">{nameError}</div>}
            </div>
            <div className="p-3 border-t border-flyway-border flex justify-end gap-2">
              <button onClick={() => { setNameModalOpen(false); setNameError(''); setModalCollapsed(false); }} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{t.config.btn_cancel}</button>
              <button
                onClick={async () => {
                  if (!pendingGenPayload) return;
                  const finalName = nameInput.trim();
                  const valid = /^V[^_]+__[^\s]+\.sql$/i.test(finalName);
                  if (!valid) { setNameError('文件名不合法: 需匹配 V<版本>__<描述>.sql'); return; }
                  setIsSavingName(true);
                  const ok = await dbService.uploadScriptToPath(config.scriptsPath, finalName, pendingGenPayload.payload);
                  setIsSavingName(false);
                  if (ok) { setNameModalOpen(false); setIsGenOpen(false); setModalCollapsed(false); handleRefresh(); }
                }}
                disabled={isSavingName}
                className={`px-3 py-1.5 text-xs rounded ${isSavingName ? 'bg-green-900 text-gray-300' : 'bg-green-700 hover:bg-green-600 text-white'} border border-green-600`}
              >
                {t.config.btn_save}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 right-3 text-[10px] text-gray-600 pointer-events-none">Powered by ApegGeek</div>
    </div>
  );
};

export default App;
