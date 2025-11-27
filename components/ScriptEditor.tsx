
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScriptFile, MigrationStatus } from '../types';
import { Play, Save, Bot, RotateCcw, FileText, AlertTriangle, Maximize2, Minimize2, Copy, Check, X } from 'lucide-react';
// import { explainSqlScript } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useLanguage } from '../contexts/LanguageContext';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark as cmOneDark } from '@codemirror/theme-one-dark';
import { dbService } from '../services/dbService';
import { cacheService } from '../services/cacheService';

interface ScriptEditorProps {
  script: ScriptFile;
  onSave: (id: string, content: string) => Promise<boolean>;
  onMigrate: (id: string) => void;
  isMigrating: boolean;
  scriptsPath: string;
  onUploadComplete?: () => void;
  onToggleFullScreen?: () => void;
  isFullScreen?: boolean;
  onRequestCollapseSidebar?: (collapsed: boolean) => void;
}

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="rounded-md overflow-hidden my-4 border border-gray-700 bg-[#1e1e1e]">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-mono text-gray-400">{match[1]}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: 0, background: '#1e1e1e', fontSize: '0.875rem' }}
          wrapLongLines
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={`${className} bg-gray-800 px-1.5 py-0.5 rounded text-sm text-amber-200/80 font-mono`} {...props}>
      {children}
    </code>
  );
};

const ScriptEditor: React.FC<ScriptEditorProps> = ({ script, onSave, onMigrate, isMigrating, scriptsPath, onUploadComplete, onToggleFullScreen, isFullScreen, onRequestCollapseSidebar }) => {
  const { t } = useLanguage();
  const [content, setContent] = useState(script.content);
  const [activeTab, setActiveTab] = useState<'editor' | 'ai'>('editor');
  const [isDirty, setIsDirty] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [applyError, setApplyError] = useState<string>("");
  const [analysisDone, setAnalysisDone] = useState(false);
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [genDesc, setGenDesc] = useState("");
  const [genOut, setGenOut] = useState("");
  const [genErr, setGenErr] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genStreamHasData, setGenStreamHasData] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [pendingGenPayload, setPendingGenPayload] = useState<{ defaultName: string; payload: string } | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptStatus, setPromptStatus] = useState<'none' | 'success' | 'error'>('none');
  const aiScrollRef = useRef<HTMLDivElement>(null);
  
  const normalizeMarkdown = (md: string) => {
    let s = md || '';
    // Standardize line endings
    s = s.replace(/\r\n/g, '\n');
    
    // Ensure space after hash for headers if missing
    s = s.replace(/(^|\n)(\s*#{1,6})(?!\s|#)/g, '$1$2 ');
    
    // Ensure empty line before headers
    s = s.replace(/([^\n])\n(\s*#{1,6}\s)/g, '$1\n\n$2');
    
    // Ensure empty line before tables (lines starting with |)
    // Only if previous line does NOT end with | (to preserve table rows)
    s = s.replace(/([^|\n])\n(\s*\|)/g, '$1\n\n$2');
    
    // Ensure empty line before lists
    s = s.replace(/([^\n])\n(\s*[-*+]|\s*\d+\.)\s/g, '$1\n\n$2');

    // Replace full-width pipes
    s = s.replace(/\uFF5C/g, '|');
    
    return s;
  };
  const normalizedAi = useMemo(() => normalizeMarkdown(aiAnalysis), [aiAnalysis]);

  useEffect(() => {
    setContent(script.content);
    setIsDirty(false);
    setAiAnalysis(""); 
  }, [script.id]);

  useEffect(() => {
    if (activeTab === 'ai' && aiScrollRef.current && isAnalyzing) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiAnalysis, activeTab, isAnalyzing]);

  useEffect(() => {
    const loadPrompt = async () => {
      setPromptLoading(true);
      const text = await dbService.getAnalyzePrompt('cache');
      setPromptText(text || '');
      setPromptLoading(false);
      setPromptStatus('none');
    };
    if (isPromptOpen) loadPrompt();
  }, [isPromptOpen]);

  

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  };

  const handleSave = async () => {
    const ok = await onSave(script.id, content);
    if (ok) setIsDirty(false);
  };

  const handleAnalyze = async () => {
    if (aiAnalysis) return;
    setIsAnalyzing(true);
    setAnalysisDone(false);
    try {
      const cfg = cacheService.getConfig();
      const aiCfg = await dbService.getAiConfig(cfg.redis);
      const res = await fetch('/api/ai/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: aiCfg ? { ai: aiCfg } : undefined, script: { name: script.name, content } })
      });
      if (!res.body) {
        const fallback = await dbService.analyzeSql(aiCfg ? { ai: aiCfg } : undefined, { name: script.name, content });
        setAiAnalysis(fallback);
        setAnalysisDone(true);
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
            setAiAnalysis(prev => prev + data);
          }
        }
      }
      setAnalysisDone(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReAnalyze = async () => {
    setAiAnalysis('');
    setApplyError('');
    await handleAnalyze();
  };

  const extractSqlBlocks = (md: string): string[] => {
    const blocks: string[] = [];
    
    // Helper to check if string looks like SQL
    const looksSql = (s: string, strict: boolean = false) => {
      const trimmed = s.trim();
      if (!trimmed) return false;

      // Check for SQL comments
      if (/^--/.test(trimmed)) return true;
      if (/^\/\*/.test(trimmed)) return true;

      const keywords = [
          'CREATE', 'ALTER', 'DROP', 'INSERT', 'UPDATE', 'DELETE', 
          'SELECT', 'BEGIN', 'COMMIT', 'ROLLBACK', 'GRANT', 'REVOKE', 
          'TRUNCATE', 'COMMENT', 'DO', 'DECLARE', 'CONSTRAINT', 
          'FOREIGN KEY', 'PRIMARY KEY', 'REFERENCES', 'ADD CONSTRAINT',
          'IF EXISTS', 'SET', 'VALUES', 'FROM', 'JOIN', 'WHERE'
      ];
      
      if (strict) {
          // In strict mode (no fences), must START with a keyword
          const reStart = new RegExp(`^(${keywords.join('|')})\\b`, 'i');
          return reStart.test(trimmed);
      } else {
          // In lenient mode (inside fences), just needs to contain keywords
          const reKw = new RegExp(`\\b(${keywords.join('|')})\\b`, 'i');
          if (reKw.test(trimmed)) return true;
          if (/;\s*$/.test(trimmed)) return true;
      }
      return false;
    };

    // 1. Fenced Code Blocks (Backticks)
    // Capture the whole block including fences
    const reBacktick = /```[\s\S]*?```/g;
    let m;
    while ((m = reBacktick.exec(md)) !== null) {
      const block = m[0];
      const lines = block.split('\n');
      // If multi-line, strip first and last
      if (lines.length >= 2) {
          const content = lines.slice(1, -1).join('\n').trim();
          if (content) blocks.push(content);
      } else {
          // Single line case: ```sql select 1``` -> select 1
          const content = block.replace(/^```\w*\s*/, '').replace(/```$/, '').trim();
          if (content) blocks.push(content);
      }
    }

    // 2. Fenced Code Blocks (Tildes)
    if (blocks.length === 0) {
        const reTilde = /~~~[\s\S]*?~~~/g;
        while ((m = reTilde.exec(md)) !== null) {
            const block = m[0];
            const lines = block.split('\n');
            if (lines.length >= 2) {
                const content = lines.slice(1, -1).join('\n').trim();
                if (content) blocks.push(content);
            }
        }
    }

    // Filter fenced blocks
    const fencedSql = blocks.filter(b => looksSql(b, false));
    if (fencedSql.length > 0) return fencedSql;
    if (blocks.length > 0) return blocks; // Return non-SQL looking fences if that's all we have

    // 3. NO FENCES FOUND - Raw Text Fallback
    // Split by double newlines to find paragraphs that look like SQL
    const paragraphs = md.split(/\n\s*\n/);
    const rawBlocks: string[] = [];
    for (const p of paragraphs) {
        if (looksSql(p, true)) { // Use strict mode
            rawBlocks.push(p.trim());
        }
    }
    
    return rawBlocks;
  };

  const handleApplyAiFix = async () => {
    setApplyError("");
    const md = aiAnalysis || "";
    // Try to find specific fix section first
    const labelIdx = md.search(/(^|\n)\s*(##?\s*)?(Fix SQL|修复 SQL|修复SQL|Fixed SQL|Refactored SQL|SQL Code)/i);
    let blocks: string[] = [];
    
    if (labelIdx >= 0) {
      // If section found, extract from there
      blocks = extractSqlBlocks(md.slice(labelIdx));
    }
    
    // If no blocks found in section (or section not found), search entire document
    if (!blocks.length) {
      blocks = extractSqlBlocks(md);
    }

    if (!blocks.length) {
      setApplyError(t.editor.ai_fix_not_found);
      return;
    }
    
    // Join all blocks with double newlines to ensure we capture all generated SQL
    // The user may expect the full content if multiple blocks are returned
    const targetBlock = blocks.join('\n\n');

    // Apply change locally first
    setContent(targetBlock);
    
    // Attempt to save
    const ok = await onSave(script.id, targetBlock);
    if (ok) {
      setIsDirty(false);
      // Switch to editor tab to show result
      setActiveTab('editor');
    } else {
      setApplyError(t.editor.save_failed || "Failed to save applied changes. Please check logs.");
      // Optional: Revert content? Or leave it for user to try saving again?
      // Leaving it allows user to manually retry save.
      setIsDirty(true);
    }
  };

  const handleInsertAiComment = async () => {
    if (!aiAnalysis) return;
    const merged = `/* AI SUGGESTIONS START */\n${aiAnalysis}\n/* AI SUGGESTIONS END */\n\n${content}`;
    setContent(merged);
    
    const ok = await onSave(script.id, merged);
    if (ok) {
      setIsDirty(false);
      setActiveTab('editor');
    } else {
      // If save fails, we don't have a specific error state for this button, but we can rely on App logs
      // or set applyError if visible
      setApplyError("Failed to save comments. Please check logs.");
      setIsDirty(true);
    }
  };

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const handleOpenGen = () => { setIsGenOpen(true); setGenDesc(''); setGenOut(''); setGenErr(''); onRequestCollapseSidebar && onRequestCollapseSidebar(true); };
  const handleGenerateSql = async () => {
    setGenErr('');
    setGenOut('');
    setGenLoading(true);
    setGenStreamHasData(false);
    try {
      const cfg = cacheService.getConfig();
      const aiCfg = await dbService.getAiConfig(cfg.redis);
      const reqCfg: any = aiCfg ? { ...cfg, ai: aiCfg } : cfg;
      const res = await fetch('/api/ai/generate-sql/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: reqCfg, description: genDesc })
      });
      if (!res.body) {
        const out = await dbService.generateSql(reqCfg, genDesc);
        setGenOut(out);
        setGenStreamHasData(true);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let first = false;
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
            if (!first) { first = true; setGenStreamHasData(true); }
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
    const existing = await dbService.fetchScriptsFromPath(scriptsPath);
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
    const desc = slugify(genDesc || 'ai generated').replace(/-/g, '_');
    const defaultName = `V${next}__${desc}.sql`;
    const blocks = extractSqlBlocks(genOut);
    const payload = (blocks.length ? blocks.join('\n\n') : genOut).trim();
    setPendingGenPayload({ defaultName, payload });
    setNameInput(defaultName);
    setNameError('');
    setNameModalOpen(true);
    onRequestCollapseSidebar && onRequestCollapseSidebar(true);
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
                    {!/^\s*Error:/i.test(aiAnalysis) && script.status === MigrationStatus.PENDING && (
             <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">{t.editor.status_pending}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isDirty && script.status === MigrationStatus.PENDING && (
            <button 
              onClick={handleSave}
              disabled={isAnalyzing}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${isAnalyzing ? 'bg-blue-900 text-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              <Save className="w-3.5 h-3.5" />
              {t.editor.btn_save}
            </button>
          )}
          <button
            onClick={handleOpenGen}
            disabled={isAnalyzing}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${isAnalyzing ? 'bg-purple-900 text-gray-300 cursor-not-allowed' : 'bg-purple-700 hover:bg-purple-600 text-white'}`}
          >
            {t.editor.gen_open}
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
      <div className="flex items-center justify-between border-b border-flyway-border bg-[#1e1e1e]">
        <div className="flex">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'editor' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            {t.editor.tab_sql}
          </button>
          <button
            onClick={() => { setActiveTab('ai'); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === 'ai' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            <Bot className="w-3.5 h-3.5" />
            {t.editor.tab_ai}
          </button>
        </div>
        {activeTab === 'ai' && (
          <div className="flex items-center gap-3 pr-3">
            <button
              onClick={() => { setIsPromptOpen(true); onRequestCollapseSidebar && onRequestCollapseSidebar(true); }}
              className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              {t.editor.prompt_open}
            </button>
            <button
              onClick={handleReAnalyze}
              disabled={isAnalyzing}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                isAnalyzing 
                  ? 'text-gray-600 cursor-not-allowed' 
                  : 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
              }`}
            >
              {isAnalyzing ? (
                <span className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
                   Analyzing...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  {t.editor.ai_reanalyze}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto relative">
        {activeTab === 'editor' ? (
          <>
            <div className="absolute top-2 right-4 z-10 flex items-center gap-2">
              {script.status === MigrationStatus.SUCCESS && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-800/90 backdrop-blur rounded border border-gray-700 text-xs text-gray-400 pointer-events-none">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  {t.editor.readonly_alert}
                </div>
              )}
              <button
                onClick={() => onToggleFullScreen && onToggleFullScreen()}
                disabled={isAnalyzing}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${isAnalyzing ? 'bg-gray-900 text-gray-500 border-gray-800 cursor-not-allowed' : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'}`}
                title={isFullScreen ? t.editor.btn_exit_fullscreen : t.editor.btn_fullscreen}
              >
                {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
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
          <div className="flex flex-col h-full bg-[#1e1e1e]">
            <div className="flex-1 overflow-y-auto p-6" ref={aiScrollRef}>
              <div className="prose prose-invert max-w-none">
                {isAnalyzing && !aiAnalysis && (
                  <div className="flex flex-col items-center justify-center h-48 space-y-4 text-purple-400">
                    <Bot className="w-8 h-8 animate-bounce" />
                    <p className="text-sm">{t.editor.ai_analyzing}</p>
                  </div>
                )}
                <div className="mb-3"></div>
                {aiAnalysis && (
                  <div className="text-gray-300">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: CodeBlock,
                        table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded border border-gray-700"><table className="min-w-full divide-y divide-gray-700" {...props} /></div>,
                        thead: ({node, ...props}) => <thead className="bg-gray-800" {...props} />,
                        tbody: ({node, ...props}) => <tbody className="bg-gray-900/30 divide-y divide-gray-700" {...props} />,
                        tr: ({node, ...props}) => <tr className="hover:bg-gray-800/50" {...props} />,
                        th: ({node, ...props}) => <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-gray-700 last:border-r-0" {...props} />,
                        td: ({node, ...props}) => <td className="px-3 py-2 text-sm text-gray-300 border-r border-gray-700 last:border-r-0" {...props} />,
                      }}
                    >
                      {normalizedAi}
                    </ReactMarkdown>
                    {applyError && (
                      <div className="mt-3 text-xs text-red-400">{applyError}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!isAnalyzing && script.status === MigrationStatus.PENDING && aiAnalysis && (
              <div className="p-3 border-t border-gray-800 bg-[#1e1e1e] shrink-0">
                <div className="flex items-center gap-4">
                  {!analysisDone && (
                    <button
                      onClick={handleApplyAiFix}
                      className="px-3 py-1.5 rounded text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
                    >
                      {t.editor.btn_apply_fix}
                    </button>
                  )}
                  {analysisDone && (
                    <>
                      <button
                        onClick={handleApplyAiFix}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-500/10 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t.editor.btn_accept_fix}
                      </button>
                      <button
                        onClick={() => { setAiAnalysis(''); setApplyError(''); setAnalysisDone(false); }}
                        className="px-3 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                      >
                        {t.editor.btn_reject_fix}
                      </button>
                    </>
                  )}
                  <div className="h-4 w-px bg-gray-800 mx-2" />
                  <button
                    onClick={handleInsertAiComment}
                    className="px-3 py-1.5 rounded text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                  >
                    {t.editor.btn_insert_ai_hint}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
                    <button onClick={() => { setIsGenOpen(false); onRequestCollapseSidebar && onRequestCollapseSidebar(false); }} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{t.editor.gen_cancel}</button>
                    <button onClick={handleGenerateSql} disabled={genLoading || !genDesc.trim()} className={`px-3 py-1.5 text-xs rounded ${genLoading ? 'bg-purple-800 text-gray-300' : 'bg-purple-700 text-white hover:bg-purple-600'} border border-purple-600`}>{t.editor.gen_generate}</button>
                  </div>
                  {genErr && <div className="mt-2 text-xs text-red-400">{genErr}</div>}
                </div>
                <div className="flex flex-col min-h-0">
                  <div className="text-xs text-gray-400 mb-1">{t.editor.gen_output_title}</div>
                  <div className="flex-1 min-h-0 bg-black/30 border border-flyway-border rounded overflow-hidden">
                    <div className="relative h-full overflow-y-auto p-2">
                      {genLoading && !genStreamHasData && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
                          <div className="flex items-center gap-2 text-purple-300">
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                            <span className="text-xs">{t.editor.thinking}</span>
                          </div>
                        </div>
                      )}
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{ code: CodeBlock }}
                      >
                        {normalizeMarkdown(genOut)}
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
      {isPromptOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-[#1e1e1e] w-[750px] h-[600px] border border-flyway-border rounded-lg shadow-xl">
            <div className="p-4 border-b border-flyway-border text-gray-200 font-semibold">{t.editor.prompt_title}</div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <textarea
                  value={promptText}
                  onChange={(e) => { setPromptText(e.target.value); setPromptStatus('none'); }}
                  className="w-full h-[460px] bg-[#1e1e1e] border border-flyway-border rounded p-2 text-xs text-gray-200 font-mono"
                />
                <div className="h-[460px] bg-[#1e1e1e] border border-flyway-border rounded p-2 overflow-y-auto">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-blue-400 mt-2 mb-3" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold text-blue-300 mt-2 mb-2" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-blue-200 mt-2 mb-1.5" {...props} />,
                      p: ({node, ...props}) => <p className="text-sm text-gray-200 leading-6" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-purple-600 pl-3 text-purple-300 my-2" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 space-y-1 text-sm text-gray-200" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 space-y-1 text-sm text-gray-200" {...props} />,
                      li: ({node, ...props}) => <li className="text-sm" {...props} />,
                      code: CodeBlock,
                      table: ({node, ...props}) => <div className="overflow-x-auto my-2 rounded border border-gray-700"><table className="min-w-full divide-y divide-gray-700" {...props} /></div>,
                      thead: ({node, ...props}) => <thead className="bg-gray-800" {...props} />, 
                      tbody: ({node, ...props}) => <tbody className="bg-gray-900/30 divide-y divide-gray-700" {...props} />, 
                      tr: ({node, ...props}) => <tr className="hover:bg-gray-800/50" {...props} />, 
                      th: ({node, ...props}) => <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-r border-gray-700 last:border-r-0" {...props} />, 
                      td: ({node, ...props}) => <td className="px-3 py-2 text-sm text-gray-300 border-r border-gray-700 last:border-r-0" {...props} />,
                    }}
                  >
                    {normalizeMarkdown(promptText)}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs">
                  {promptLoading && <span className="text-blue-400">Loading...</span>}
                  {promptStatus === 'success' && <span className="text-green-400">{t.editor.prompt_save_success}</span>}
                  {promptStatus === 'error' && <span className="text-red-400">{t.editor.prompt_save_fail}</span>}
                </div>
                <div className="flex gap-2">
                  
                  <button
                    onClick={async () => {
                      const cfg = cacheService.getConfig();
                      const ok = await dbService.saveAnalyzePrompt(promptText, cfg.redis);
                      setPromptStatus(ok ? 'success' : 'error');
                    }}
                    className="px-3 py-1.5 text-xs rounded bg-purple-700 text-white border border-purple-600 hover:bg-purple-600"
                  >
                    {t.editor.prompt_save}
                  </button>
                  <button
                    onClick={() => { setIsPromptOpen(false); onRequestCollapseSidebar && onRequestCollapseSidebar(false); }}
                    className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700"
                  >
                    {t.editor.gen_cancel}
                  </button>
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
              <button onClick={() => { setNameModalOpen(false); setNameError(''); onRequestCollapseSidebar && onRequestCollapseSidebar(false); }} className="text-gray-400 hover:text-white">
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
              <button onClick={() => { setNameModalOpen(false); setNameError(''); onRequestCollapseSidebar && onRequestCollapseSidebar(false); }} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{t.config.btn_cancel}</button>
              <button
                onClick={async () => {
                  if (!pendingGenPayload) return;
                  const finalName = nameInput.trim();
                  const valid = /^V[^_]+__[^\s]+\.sql$/i.test(finalName);
                  if (!valid) { setNameError('文件名不合法: 需匹配 V<版本>__<描述>.sql'); return; }
                  setIsSavingName(true);
                  const ok = await dbService.uploadScriptToPath(scriptsPath, finalName, pendingGenPayload.payload);
                  setIsSavingName(false);
                  if (ok) { setNameModalOpen(false); setIsGenOpen(false); onRequestCollapseSidebar && onRequestCollapseSidebar(false); if (onUploadComplete) onUploadComplete(); }
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
    </div>
  );
};

export default ScriptEditor;
