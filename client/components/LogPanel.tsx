
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { X, Trash2, Terminal } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface LogPanelProps {
  logs: LogEntry[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
  height?: number;
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, isOpen, onClose, onClear, height }) => {
  const { t } = useLanguage();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ height: height ?? 192 }} className="bg-black border-t border-flyway-border flex flex-col font-mono text-xs shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between px-3 py-1 bg-flyway-panel border-b border-flyway-border">
        <div className="flex items-center gap-2 text-gray-400">
          <Terminal className="w-3.5 h-3.5" />
          <span className="font-semibold uppercase">{t.logs.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClear} className="p-1 hover:text-white text-gray-500" title="Clear logs">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 hover:text-white text-gray-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {logs.length === 0 && (
          <div className="text-gray-600 italic">{t.logs.empty}</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 hover:bg-white/5 p-0.5 rounded">
            <span className="text-gray-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span className={`shrink-0 font-bold w-16 ${
              log.level === 'INFO' ? 'text-blue-400' :
              log.level === 'WARN' ? 'text-amber-400' :
              log.level === 'ERROR' ? 'text-red-400' :
              'text-green-400'
            }`}>
              {log.level}
            </span>
            <span className="text-gray-300 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default LogPanel;
