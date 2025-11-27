import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText: string;
  cancelText: string;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ open, title, description, onConfirm, onCancel, confirmText, cancelText }) => {
  if (!open) return null;
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] w-[520px] border border-flyway-border rounded-lg shadow-xl overflow-hidden">
        <div className="p-3 border-b border-flyway-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <AlertTriangle className="w-4 h-4" />
            <span>{title}</span>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">
          <div className="text-sm text-gray-200 whitespace-pre-wrap">{description}</div>
          <div className="flex items-center justify-end gap-2 mt-6">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded bg-gray-800 text-gray-300 border border-gray-700">{cancelText}</button>
            <button onClick={onConfirm} className="px-3 py-1.5 text-xs rounded bg-red-700 text-white border border-red-600 hover:bg-red-600">{confirmText}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
