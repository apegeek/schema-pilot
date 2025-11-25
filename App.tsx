
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ScriptEditor from './components/ScriptEditor';
import LogPanel from './components/LogPanel';
import ConfigModal from './components/ConfigModal';
import HistoryTable from './components/HistoryTable';
import LoginScreen from './components/LoginScreen';
import { ScriptFile, DbConfig, LogEntry, MigrationStatus, HistoryRecord } from './types';
import { PanelBottom, GripVertical } from 'lucide-react';
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
  const [dragging, setDragging] = useState<'none' | 'sidebar' | 'editor'>('none');
  const mainRef = useRef<HTMLDivElement | null>(null);
  const [isEditorFull, setIsEditorFull] = useState(false);

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

  const handleSaveScript = async (id: string, newContent: string) => {
    const s = scripts.find(x => x.id === id);
    if (!s) return;
    if (s.status !== MigrationStatus.PENDING) {
      addLog('WARN', 'Save blocked: only pending scripts can be edited.');
      return;
    }
    const ok = await dbService.saveScriptContent(config.scriptsPath, s.path || '', s.name, newContent);
    if (ok) {
      const updated = scripts.map(x => x.id === id ? { ...x, content: newContent } : x);
      setScripts(updated);
      cacheService.saveScripts(config.scriptsPath, updated, config);
      addLog('SUCCESS', `Saved script: ${s.name}`);
    } else {
      addLog('ERROR', `Failed to save script: ${s.name}`);
    }
  };

  const handleMigrate = async (id: string) => {
    const script = scripts.find(s => s.id === id);
    if (!script) return;

    setMigratingId(id);
    addLog('INFO', `Connecting to ${config.host}...`);
    addLog('INFO', `Executing migration: ${script.name}`);
    
    try {
      // Simulate network latency
      await new Promise(resolve => setTimeout(resolve, 1200));

      const installedOn = new Date().toISOString();
      const executionTime = Math.floor(Math.random() * 200) + 20;
      const checksum = Math.floor(Math.random() * 1000000000);

      // 1. Create new Record
      const newRecord: HistoryRecord = {
        installed_rank: history.length + 1,
        version: script.version,
        description: script.description,
        type: 'SQL',
        script: script.name,
        checksum: checksum,
        installed_by: config.user,
        installed_on: installedOn,
        execution_time: executionTime,
        success: true
      };

      // 2. Update State (which triggers Comparison Logic effect)
      const newHistory = [...history, newRecord];
      setHistory(newHistory);
      
      // 3. Update Cache
      cacheService.saveHistory(config, newHistory);
      
      addLog('SUCCESS', `Migration ${script.version} applied successfully in ${executionTime}ms.`);
    
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
      <div className="flex-1 flex flex-col min-w-0">
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
                <div className="flex h-full items-center justify-center text-gray-500 select-none bg-[#1e1e1e] flex-col">
                  <div className="w-24 h-24 rounded-full bg-gray-800/50 flex items-center justify-center mb-6">
                     <PanelBottom className="w-10 h-10 opacity-30" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-400 mb-2">{t.sidebar.no_scripts}</h3>
                  <p className="text-sm text-gray-600 max-w-sm text-center">
                     {t.sidebar.back_link}
                  </p>
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
                  <div className="flex h-full items-center justify-center text-gray-500 select-none bg-[#1e1e1e] flex-col">
                    <div className="w-24 h-24 rounded-full bg-gray-800/50 flex items-center justify-center mb-6">
                       <PanelBottom className="w-10 h-10 opacity-30" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-400 mb-2">{t.sidebar.no_scripts}</h3>
                    <p className="text-sm text-gray-600 max-w-sm text-center">
                       {t.sidebar.back_link}
                    </p>
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
        <LogPanel 
          logs={logs} 
          isOpen={isLogOpen} 
          onClose={() => setIsLogOpen(false)} 
          onClear={() => setLogs([])}
        />
      </div>
      <ConfigModal 
        isOpen={isConfigOpen} 
        config={config} 
        onClose={() => setIsConfigOpen(false)}
        onSave={(newConfig) => {
          setConfig(newConfig);
          addLog('INFO', 'Configuration updated. Initiating reload...');
          if (isAuthenticated) {
            loadData(newConfig);
          }
        }}
      />
    </div>
  );
};

export default App;
