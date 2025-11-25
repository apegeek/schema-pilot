
import React, { useState, useEffect } from 'react';
import { ScriptFile, MigrationStatus } from '../types';
import { Play, Save, Bot, RotateCcw, FileText, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react';
import { explainSqlScript } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../contexts/LanguageContext';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark as cmOneDark } from '@codemirror/theme-one-dark';
import { dbService } from '../services/dbService';

interface ScriptEditorProps {
  script: ScriptFile;
  onSave: (id: string, content: string) => void;
  onMigrate: (id: string) => void;
  isMigrating: boolean;
  scriptsPath: string;
  onUploadComplete?: () => void;
  onToggleFullScreen?: () => void;
  isFullScreen?: boolean;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ script, onSave, onMigrate, isMigrating, scriptsPath, onUploadComplete, onToggleFullScreen, isFullScreen }) => {
  const { t } = useLanguage();
  const [content, setContent] = useState(script.content);
  const [activeTab, setActiveTab] = useState<'editor' | 'ai'>('editor');
  const [isDirty, setIsDirty] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    setContent(script.content);
    setIsDirty(false);
    setAiAnalysis(""); 
  }, [script.id]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(script.id, content);
    setIsDirty(false);
  };

  const handleAnalyze = async () => {
    if (aiAnalysis) return; // Already analyzed
    setIsAnalyzing(true);
    const result = await explainSqlScript(content, script.name);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 p-3 border-b border-flyway-border bg-flyway-panel">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="font-mono font-semibold text-gray-200 break-all">{script.name}</span>
          </div>
          {script.status === MigrationStatus.SUCCESS && (
             <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">{t.editor.status_applied}</span>
          )}
          {script.status === MigrationStatus.PENDING && (
             <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">{t.editor.status_pending}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isDirty && script.status === MigrationStatus.PENDING && (
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors bg-blue-600 hover:bg-blue-500 text-white"
            >
              <Save className="w-3.5 h-3.5" />
              {t.editor.btn_save}
            </button>
          )}
          <label className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-transparent text-gray-400 hover:text-green-400 cursor-pointer">
            <input type="file" accept=".sql" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const ok = await dbService.uploadScriptToPath(scriptsPath, file.name, text);
              if (ok && onUploadComplete) onUploadComplete();
            }} />
            {t.editor.btn_upload}
          </label>
          <button
            onClick={() => onToggleFullScreen && onToggleFullScreen()}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-transparent text-gray-400 hover:text-gray-200"
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          
          <button 
            onClick={() => onMigrate(script.id)}
            disabled={script.status !== MigrationStatus.PENDING || isMigrating || isDirty}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors
              ${script.status === MigrationStatus.PENDING && !isMigrating && !isDirty
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20' 
                : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'}
            `}
          >
            {isMigrating ? <RotateCcw className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5 fill-current" />}
            {isMigrating ? t.editor.btn_migrating : t.editor.btn_migrate}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-flyway-border bg-[#1e1e1e]">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'editor' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
        >
          {t.editor.tab_sql}
        </button>
        <button
          onClick={() => { setActiveTab('ai'); handleAnalyze(); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'ai' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
        >
          <Bot className="w-3.5 h-3.5" />
          {t.editor.tab_ai}
        </button>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto relative">
        {activeTab === 'editor' ? (
          <>
            {script.status === MigrationStatus.SUCCESS && (
              <div className="absolute top-2 right-4 z-10 flex items-center gap-2 px-3 py-1 bg-gray-800/90 backdrop-blur rounded border border-gray-700 text-xs text-gray-400 pointer-events-none">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                {t.editor.readonly_alert}
              </div>
            )}
            <div className="h-full">
              <CodeMirror
                value={content}
                height="100%"
                theme={cmOneDark}
                extensions={[sql()]}
                editable={script.status === MigrationStatus.PENDING}
                basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
                onChange={(val) => { setContent(val); setIsDirty(true); }}
              />
            </div>
          </>
        ) : (
          <div className="h-full overflow-y-auto p-6 bg-[#1e1e1e]">
             {isAnalyzing ? (
               <div className="flex flex-col items-center justify-center h-48 space-y-4 text-purple-400">
                  <Bot className="w-8 h-8 animate-bounce" />
                  <p className="text-sm">{t.editor.ai_analyzing}</p>
               </div>
             ) : (
               <div className="prose prose-invert prose-sm max-w-none">
                 <div className="bg-purple-900/10 border border-purple-500/20 rounded-lg p-4 mb-4">
                    <h3 className="flex items-center gap-2 text-purple-400 mt-0">
                      <Bot className="w-5 h-5" />
                      {t.editor.ai_title}
                    </h3>
                    <div className="text-gray-300">
                      <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                    </div>
                 </div>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptEditor;
