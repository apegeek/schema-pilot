
import React from 'react';
import { HistoryRecord } from '../types';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface HistoryTableProps {
  history: HistoryRecord[];
  onJump?: (record: HistoryRecord) => void;
  canBatch?: boolean;
  onBatch?: () => void;
}

const HistoryTable: React.FC<HistoryTableProps> = ({ history, onJump, canBatch, onBatch }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] overflow-hidden">
      <div className="p-4 border-b border-flyway-border bg-flyway-panel">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-200">{t.history.title}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {t.history.subtitle} <code className="text-blue-400">flyway_schema_history</code>
            </p>
          </div>
          {canBatch && (
            <button
              onClick={onBatch}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-green-700 hover:bg-green-600 text-white border border-green-600"
              title={t.history.col_version}
            >
              {t.history.batch_merge}
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <div className="min-w-full inline-block align-middle">
          <div className="border border-flyway-border rounded overflow-hidden">
            <table className="min-w-full divide-y divide-flyway-border">
              <thead className="bg-flyway-dark">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_rank}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_version}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_desc}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_type}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_script}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_installed}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_time}</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">{t.history.col_state}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-flyway-border bg-[#1e1e1e]">
                {history.length === 0 ? (
                    <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 italic">
                            {t.history.empty}
                        </td>
                    </tr>
                ) : (
                    history.map((record) => (
                      <tr key={record.installed_rank} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 font-mono">{record.installed_rank}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium font-mono">
                          <button
                            onClick={() => onJump && onJump(record)}
                            className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
                            title={t.history.col_version}
                          >
                            {record.version ?? '-'}
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{record.description}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{record.type}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">{record.script}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                          {new Date(record.installed_on).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 font-mono text-right">{record.execution_time}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {record.success ? (
                            <div className="flex items-center gap-1.5 text-green-500">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-xs font-semibold">{t.history.state_success}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500">
                              <XCircle className="w-4 h-4" />
                              <span className="text-xs font-semibold">{t.history.state_fail}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryTable;
