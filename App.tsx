
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ScriptEditor from './components/ScriptEditor';
import LogPanel from './components/LogPanel';
import ConfigModal from './components/ConfigModal';
import HistoryTable from './components/HistoryTable';
import LoginScreen from './components/LoginScreen';
import { ScriptFile, DbConfig, LogEntry, MigrationStatus, HistoryRecord } from './types';
import { PanelBottom, GripVertical, GripHorizontal } from 'lucide-react';
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
  const [dragging, setDragging] = useState<'none' | 'sidebar' | 'editor' | 'log'>('none');
  const mainRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const [isEditorFull, setIsEditorFull] = useState(false);
  const [logHeight, setLogHeight] = useState<number>(192);
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [genDesc, setGenDesc] = useState("");
  const [genOut, setGenOut] = useState("");
  const [genErr, setGenErr] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    const auth = cacheService.getAuthToken();
    if (auth) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
    const onMove = (e: MouseEvent) => {
      if (dragging === 'sidebar') {
        setSidebarWidth(clamp(e.clientX, 260, 560));
      } else if (dragging === 'editor') {
        const rect = mainRef.current?.getBoundingClientRect();
        if (rect) {
          const newWidth = clamp(rect.right - e.clientX, 320, Math.min(900, rect.width - 420));
          setEditorWidth(newWidth);
        }
      } else if (dragging === 'log') {
        const rect = columnRef.current?.getBoundingClientRect();
        const bottom = rect ? rect.bottom : window.innerHeight;
        const newHeight = clamp(bottom - e.clientY, 120, 480);
        setLogHeight(newHeight);
      }
    };
    const onUp = () => setDragging('none');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

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
  };
  const handleGenerateSql = async () => {
    setGenErr('');
    setGenOut('');
    setGenLoading(true);
    const out = await dbService.generateSql(undefined, genDesc);
    setGenLoading(false);
    setGenOut(out);
  };
  const handleSaveGenerated = async () => {
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const name = `V${Date.now()}__${slugify('ai_generated')}.sql`;
    const ok = await dbService.uploadScriptToPath(config.scriptsPath, name, genOut);
    if (ok) handleRefresh();
    setIsGenOpen(false);
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
    <div className="flex h-screen overflow-hidden bg-[#1e1e1e]">
      <div style={{ width: sidebarWidth }} className="shrink-0">
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
        />
      </div>
      <div
        className="w-3 bg-flyway-border/50 hover:bg-blue-500 cursor-col-resize flex items-center justify-center"
        onMouseDown={() => setDragging('sidebar')}
        title={t.sidebar.resize_tooltip}
      >
        <GripVertical className="w-3 h-3 text-gray-500 pointer-events-none" />
      </div>
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
                  isFullScreen
                />
              ) : (
                <div className="flex flex-col h-full bg-[#1e1e1e]">
                  <div className="flex flex-col gap-2 p-3 border-b border-flyway-border bg-flyway-panel">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-transparent text-gray-400 hover:text-green-400 cursor-pointer">
                        <input type="file" accept=".sql" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const text = await file.text();
                          const ok = await dbService.uploadScriptToPath(config.scriptsPath, file.name, text);
                          if (ok) handleRefresh();
                        }} />
                        {t.editor.btn_upload}
                      </label>
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
                    <h3 className="text-lg font-medium text-gray-400 mb-2">{t.sidebar.no_scripts}</h3>
                    <p className="text-sm text-gray-600 max-w-sm text-center">{t.sidebar.back_link}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-[420px] border-r border-flyway-border bg-[#1e1e1e]">
                <HistoryTable history={history} />
              </div>
              <div
                className="w-3 bg-flyway-border/50 hover:bg-blue-500 cursor-col-resize flex items-center justify-center"
                onMouseDown={() => setDragging('editor')}
                title={t.sidebar.resize_tooltip}
              >
                <GripVertical className="w-3 h-3 text-gray-500 pointer-events-none" />
              </div>
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
                  />
                ) : (
                  <div className="flex flex-col h-full bg-[#1e1e1e]">
                    <div className="flex flex-col gap-2 p-3 border-b border-flyway-border bg-flyway-panel">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-transparent text-gray-400 hover:text-green-400 cursor-pointer">
                          <input type="file" accept=".sql" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const text = await file.text();
                            const ok = await dbService.uploadScriptToPath(config.scriptsPath, file.name, text);
                            if (ok) handleRefresh();
                          }} />
                          {t.editor.btn_upload}
                        </label>
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
                      <h3 className="text-lg font-medium text-gray-400 mb-2">{t.sidebar.no_scripts}</h3>
                      <p className="text-sm text-gray-600 max-w-sm text-center">{t.sidebar.back_link}</p>
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
          <div
            className="h-2 bg-flyway-border/50 hover:bg-blue-500 cursor-row-resize flex items-center justify-center"
            onMouseDown={() => setDragging('log')}
            title={t.logs.resize_tooltip}
          >
            <GripHorizontal className="w-3 h-3 text-gray-500 pointer-events-none" />
          </div>
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
          setConfig(newConfig);
          addLog('INFO', 'Configuration updated. Initiating reload...');
          dbService.saveAiConfig(newConfig).then(ok => {
            if (ok) addLog('SUCCESS', 'AI configuration saved to Redis.');
            else addLog('WARN', 'AI configuration not saved (Redis disabled or error).');
          });
          if (isAuthenticated) {
            loadData(newConfig);
          }
        }}
      />
      {isGenOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-[#1e1e1e] w-[560px] border border-flyway-border rounded-lg shadow-xl">
            <div className="p-4 border-b border-flyway-border text-gray-200 font-semibold">{t.editor.gen_title}</div>
            <div className="p-4 space-y-3">
              <label className="text-xs text-gray-400">{t.editor.gen_desc_label}</label>
              <textarea
                value={genDesc}
                onChange={(e) => setGenDesc(e.target.value)}
                className="w-full h-28 bg-[#1e1e1e] border border-flyway-border rounded p-2 text-sm text-gray-200"
                placeholder={t.editor.gen_desc_placeholder}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsGenOpen(false)} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{t.editor.gen_cancel}</button>
                <button onClick={handleGenerateSql} disabled={genLoading || !genDesc.trim()} className={`px-3 py-1.5 text-xs rounded ${genLoading ? 'bg-purple-800 text-gray-300' : 'bg-purple-700 text-white hover:bg-purple-600'} border border-purple-600`}>{t.editor.gen_generate}</button>
              </div>
              {genErr && <div className="text-xs text-red-400">{genErr}</div>}
              {genOut && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-1">{t.editor.gen_output_title}</div>
                  <pre className="bg-black/30 border border-flyway-border rounded p-2 text-xs text-gray-200 whitespace-pre-wrap">{genOut}</pre>
                  <div className="flex justify-end mt-2">
                    <button onClick={handleSaveGenerated} className="px-3 py-1.5 text-xs rounded bg-green-700 text-white border border-green-600 hover:bg-green-600">{t.editor.gen_save}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
