
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
  deleteScriptFromPath: async (path: string, dir: string, name: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/scripts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, dir, name })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: (data as any)?.error || `HTTP ${res.status}` };
      }
      const data = await res.json();
      if ((data as any)?.ok) {
        return { ok: true };
      } else {
        return { ok: false, error: (data as any)?.error || 'Unknown error' };
      }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Network error' };
    }
  }
  ,
  saveScriptContent: async (path: string, dir: string, name: string, content: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/scripts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, dir, name, content })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: (data as any)?.error || `HTTP ${res.status}` };
      }
      const data = await res.json();
      if ((data as any)?.ok) {
        return { ok: true };
      } else {
        return { ok: false, error: (data as any)?.error || 'Unknown error' };
      }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Network error' };
    }
  }
  ,
  executeMigration: async (config: DbConfig, script: { name: string; content: string }): Promise<{ ok: boolean; error?: string; historyError?: string }> => {
    try {
      const res = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, script })
      });
      const data = await res.json();
      return { ok: Boolean((data as any)?.ok), error: (data as any)?.error, historyError: (data as any)?.historyError };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || 'Network error') };
    }
  }
  ,
  saveAiConfig: async (config: DbConfig): Promise<boolean> => {
    try {
      const res = await fetch('/api/ai/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai: config.ai, redis: config.redis })
      });
      const data = await res.json();
      return Boolean((data as any)?.ok);
    } catch {
      return false;
    }
  },
  getAiConfig: async (): Promise<any | null> => {
    try {
      const res = await fetch('/api/ai/config/get');
      if (!res.ok) return null;
      const data = await res.json();
      return (data as any)?.ai || null;
    } catch {
      return null;
    }
  },
  getAnalyzePrompt: async (source?: 'default' | 'cache'): Promise<string> => {
    try {
      const res = await fetch(`/api/ai/prompt/get${source ? `?source=${source}` : ''}`);
      const data = await res.json();
      if ((data as any)?.ok && typeof (data as any)?.text === 'string') return (data as any).text;
      return '';
    } catch {
      return '';
    }
  },
  saveAnalyzePrompt: async (prompt: string, redis?: any): Promise<boolean> => {
    try {
      const res = await fetch('/api/ai/prompt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, redis })
      });
      const data = await res.json();
      return Boolean((data as any)?.ok);
    } catch {
      return false;
    }
  },
  analyzeSql: async (config: Partial<DbConfig> | undefined, script: { name: string; content: string }): Promise<string> => {
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, script })
      });
      const data = await res.json();
      if ((data as any)?.ok && typeof (data as any)?.text === 'string') return (data as any).text;
      return String((data as any)?.error || 'AI analysis failed');
    } catch (e: any) {
      return String(e?.message || 'Network error');
    }
  },
  generateSql: async (config: Partial<DbConfig> | undefined, description: string): Promise<string> => {
    try {
      const res = await fetch('/api/ai/generate-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, description })
      });
      const data = await res.json();
      if ((data as any)?.ok && typeof (data as any)?.text === 'string') return (data as any).text;
      return String((data as any)?.error || 'Generate SQL failed');
    } catch (e: any) {
      return String(e?.message || 'Network error');
    }
  }
};
