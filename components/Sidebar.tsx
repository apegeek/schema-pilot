
import React, { useState, useEffect } from 'react';
import { ScriptFile, MigrationStatus, DbConfig, TreeItem } from '../types';
import { Folder, FolderOpen, Database, CheckCircle2, AlertCircle, Clock, Settings, Table2, FileCode2, ChevronRight, ChevronDown, RefreshCw, LogOut, Loader2, Upload, Trash2, X, AlertTriangle } from 'lucide-react';
import { buildScriptTree } from '../utils/treeUtils';
import { dbService } from '../services/dbService';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
  scripts: ScriptFile[];
  config: DbConfig;
  selectedScriptId: string | null;
  currentView: 'scripts' | 'history';
  onSelectScript: (id: string) => void;
  onChangeView: (view: 'scripts' | 'history') => void;
  onOpenConfig: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  isLoading?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  scripts, 
  config, 
  selectedScriptId, 
  currentView,
  onSelectScript,
  onChangeView,
  onOpenConfig,
  onRefresh,
  onLogout,
  isLoading = false
}) => {
  const { t, language, setLanguage } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);
  const [treeData, setTreeData] = useState<TreeItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<ScriptFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  

  useEffect(() => {
    const tree = buildScriptTree(scripts);
    setTreeData(tree);
    
    // Only auto-expand initially if not already set to avoid collapsing on refresh
    if (expandedFolders.size === 0) {
        const getAllFolderIds = (nodes: TreeItem[]): string[] => {
        let ids: string[] = [];
        nodes.forEach(node => {
            if (node.type === 'folder') {
            ids.push(node.id);
            if (node.children) ids = ids.concat(getAllFolderIds(node.children));
            }
        });
        return ids;
        };
        setExpandedFolders(new Set(getAllFolderIds(tree)));
    }
  }, [scripts]);

  const toggleFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  

  const getStatusIcon = (status: MigrationStatus) => {
    switch (status) {
      case MigrationStatus.SUCCESS:
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      case MigrationStatus.FAILED:
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      case MigrationStatus.PENDING:
        return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <div className="w-3 h-3 rounded-full border border-gray-500" />;
    }
  };

  const renderTree = (nodes: TreeItem[], depth: number = 0) => {
    return nodes.map(node => {
      if (node.type === 'folder') {
        const isOpen = expandedFolders.has(node.id);
        return (
          <div key={node.id}>
            <div 
              className="flex items-center gap-1.5 py-1 pr-2 hover:bg-white/5 cursor-pointer text-gray-400 select-none transition-colors"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={(e) => toggleFolder(node.id, e)}
            >
              {isOpen ? <ChevronDown className="w-3 h-3 opacity-70" /> : <ChevronRight className="w-3 h-3 opacity-70" />}
              {isOpen ? <FolderOpen className="w-4 h-4 text-yellow-500/80" /> : <Folder className="w-4 h-4 text-yellow-500/80" />}
              <span className="text-xs font-medium truncate">{node.name}</span>
            </div>
            {isOpen && node.children && (
              <div className="border-l border-white/5 ml-3">
                {renderTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      } else {
        const script = node.data!;
        const isSelected = selectedScriptId === script.id;
        return (
          <div
            key={node.id}
            onClick={() => onSelectScript(script.id)}
            className={`
              group flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-all border-l-2
              ${isSelected 
                ? 'bg-blue-600/10 border-blue-500 text-blue-100' 
                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}
            `}
            style={{ paddingLeft: `${depth * 12 + 10}px` }}
          >
            <div className="shrink-0" title={script.status === MigrationStatus.SUCCESS ? t.history.state_success : (script.status === MigrationStatus.FAILED ? t.history.state_fail : t.editor.status_pending)}>{getStatusIcon(script.status)}</div>
            <div className="w-full flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <span className="truncate text-xs font-mono">{script.name}</span>
                {script.version && (
                  <span className="ml-2 text-[10px] opacity-50 uppercase tracking-wider">{script.version}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-flex items-center h-5 px-1.5 text-[10px] font-semibold ${script.status === MigrationStatus.SUCCESS ? 'text-green-500' : (script.status === MigrationStatus.FAILED ? 'text-red-500' : 'text-amber-500')}`}>
                  {script.status === MigrationStatus.SUCCESS ? t.editor.status_applied : (script.status === MigrationStatus.FAILED ? t.history.state_fail : t.editor.status_pending)}
                </span>
                {script.status === MigrationStatus.PENDING && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setToDelete(script); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-900/20 text-gray-400 hover:text-red-400 transition-colors flex items-center"
                    title={t.sidebar.delete_tooltip}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }
    });
  };

  return (
    <>
    <div className="w-full bg-flyway-panel border-r border-flyway-border flex flex-col h-full text-sm shrink-0 shadow-xl z-20 relative">
      
      {/* Header */}
      <div className="p-4 border-b border-flyway-border bg-flyway-dark/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2 text-lg">
            <Database className="w-5 h-5 text-blue-500" />
            <span className="tracking-tight text-gray-200">{t.sidebar.title}</span>
          </h2>
          <div className="flex gap-1">
            <button 
              onClick={toggleLanguage}
              className="p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white flex items-center justify-center w-8 font-bold text-xs"
              title="Switch Language"
            >
              {language === 'zh' ? 'En' : '中'}
            </button>
            <button 
              onClick={onRefresh}
              className={`p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-blue-400 ${isLoading ? 'animate-spin text-blue-500' : ''}`}
              title={t.sidebar.refresh_tooltip}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <label className="p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-green-400 cursor-pointer" title={t.sidebar.upload_tooltip}>
              <input type="file" accept=".sql" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setIsUploading(true);
                const text = await file.text();
                const ok = await dbService.uploadScriptToPath(config.scriptsPath, file.name, text);
                setIsUploading(false);
                if (ok) onRefresh();
              }} />
              <Upload className={`w-4 h-4 ${isUploading ? 'animate-pulse' : ''}`} />
            </label>
            
            <button 
              onClick={onOpenConfig}
              className="p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
              title={t.sidebar.config_tooltip}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={onLogout}
              className="p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-red-400 ml-1"
              title={t.sidebar.logout_tooltip}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="bg-black/30 p-3 rounded-lg text-xs text-gray-400 border border-flyway-border/50 mb-4 shadow-inner relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
             <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] transition-colors ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="text-gray-300 font-bold uppercase text-[10px] tracking-wider">{config.type}</span>
             </div>
             <span className="font-mono text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-900/30 text-[10px]">{config.schema}</span>
          </div>
          <div className="truncate text-gray-500 font-mono text-[10px]" title={`${config.host}:${config.port}/${config.database}`}>
            {config.user}@{config.host}:{config.port}
          </div>
          
          {isLoading && (
              <div className="absolute bottom-0 left-0 h-0.5 bg-blue-500 animate-loading-bar w-full"></div>
          )}
        </div>

        
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-2 relative">
        {isLoading && treeData.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-flyway-panel/50 backdrop-blur-[1px] z-10">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-2" />
                <span className="text-xs text-gray-400">{t.sidebar.loading}</span>
            </div>
        )}

        <div className="mb-2 px-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center justify-between">
          <span>{t.sidebar.header_tree}</span>
          <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">{scripts.length} {t.sidebar.header_files}</span>
        </div>
        
        <div className="px-2">
           {/* Root Path Visual */}
           <div className="flex items-center gap-2 py-1 px-2 mb-2 text-gray-500 opacity-70 border-b border-dashed border-gray-800 pb-2">
              <Folder className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono truncate max-w-full" title={config.scriptsPath}>
                {config.scriptsPath}
              </span>
           </div>
           
           <div className="space-y-0.5">
              {renderTree(treeData)}
              {scripts.length === 0 && !isLoading && (
                  <div className="px-4 py-6 text-center text-gray-600 text-xs italic">
                      {t.sidebar.no_scripts}
                  </div>
              )}
           </div>
        </div>
      </div>
    </div>
    {toDelete && (
      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30">
        <div className="bg-[#1e1e1e] w-[520px] border border-flyway-border rounded-lg shadow-xl">
          <div className="p-3 border-b border-flyway-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-300 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              {t.sidebar.delete_confirm_title}
            </div>
            <button onClick={() => setToDelete(null)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            <div className="text-xs text-gray-400">{t.sidebar.delete_confirm_desc}</div>
            <div className="bg-black/20 border border-flyway-border rounded p-2 text-xs text-gray-300 font-mono">
              {toDelete.name}
            </div>
          </div>
          <div className="p-3 border-t border-flyway-border flex justify-end gap-2">
            <button onClick={() => setToDelete(null)} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{t.config.btn_cancel}</button>
            <button
              onClick={async () => {
                if (!toDelete) return;
                setIsDeleting(true);
                const res = await dbService.deleteScriptFromPath(config.scriptsPath, toDelete.path || '', toDelete.name);
                setIsDeleting(false);
                if (res.ok) {
                  setToDelete(null);
                  onRefresh();
                }
              }}
              disabled={isDeleting}
              className={`px-3 py-1.5 text-xs rounded ${isDeleting ? 'bg-red-900 text-gray-300' : 'bg-red-700 hover:bg-red-600 text-white'} border border-red-600`}
            >
              {t.sidebar.delete_confirm_btn}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Sidebar;
