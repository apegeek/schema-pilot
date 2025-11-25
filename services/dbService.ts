
import { DbConfig, HistoryRecord, ScriptFile } from '../types';

// This service simulates the Backend API that connects to the real DB and File System
export const dbService = {
  
  // Simulates: SELECT * FROM flyway_schema_history
  fetchHistoryFromDb: async (config: DbConfig): Promise<HistoryRecord[]> => {
    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      return Array.isArray(data) ? data as HistoryRecord[] : [];
    } catch (e) {
      return [];
    }
  },

  // Simulates: Reading files from disk at config.scriptsPath
  fetchScriptsFromPath: async (path: string): Promise<ScriptFile[]> => {
    try {
      const res = await fetch(`/api/scripts?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('Failed to read scripts');
      const scripts = await res.json();
      return Array.isArray(scripts) ? (scripts as ScriptFile[]) : [];
    } catch (e) {
      return [];
    }
  },
  uploadScriptToPath: async (path: string, name: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/scripts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name, content })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean((data as any)?.ok);
    } catch (e) {
      return false;
    }
  }
  ,
  saveScriptContent: async (path: string, dir: string, name: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/scripts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, dir, name, content })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean((data as any)?.ok);
    } catch (e) {
      return false;
    }
  }
};
