
import { DbConfig, HistoryRecord, ScriptFile } from '../types';

const BASE_KEYS = {
  CONFIG: 'flyway_viz:global_config',
  AUTH: 'flyway_viz:auth_token',
};

// Helper to generate a Redis-like key based on DB connection info
const getDbKey = (config: DbConfig) => {
  return `flyway_viz:history:${config.host}:${config.port}:${config.database}`;
};

// Helper to generate a key based on file path
const getScriptKey = (path: string) => {
  return `flyway_viz:scripts:${path}`; // simple hash simulation
};

export const cacheService = {
  // Global Config (Always persisted locally to remember settings)
  saveConfig: (config: DbConfig) => {
    try {
      localStorage.setItem(BASE_KEYS.CONFIG, JSON.stringify(config));
      return true;
    } catch (e) {
      console.error("Cache Write Error", e);
      return false;
    }
  },
  getConfig: (): DbConfig => {
    try {
      const data = localStorage.getItem(BASE_KEYS.CONFIG);
      return data ? JSON.parse(data) : {
        type: 'MySQL',
        host: '',
        port: '',
        database: '',
        user: '',
        schema: '',
        scriptsPath: '',
        appPassword: 'admin',
        redis: { enabled: false, host: '', port: '', dbIndex: 0 }
      };
    } catch (e) {
      return {
        type: 'MySQL',
        host: '',
        port: '',
        database: '',
        user: '',
        schema: '',
        scriptsPath: '',
        appPassword: 'admin',
        redis: { enabled: false, host: '', port: '', dbIndex: 0 }
      };
    }
  },

  saveAuthToken: (token: string, expiresAt: number) => {
    try {
      localStorage.setItem(BASE_KEYS.AUTH, JSON.stringify({ token, expiresAt }));
      return true;
    } catch (e) {
      return false;
    }
  },
  getAuthToken: (): { token: string; expiresAt: number } | null => {
    try {
      const data = localStorage.getItem(BASE_KEYS.AUTH);
      if (!data) return null;
      const obj = JSON.parse(data);
      if (!obj || !obj.token || !obj.expiresAt) return null;
      if (Date.now() >= Number(obj.expiresAt)) {
        localStorage.removeItem(BASE_KEYS.AUTH);
        return null;
      }
      return obj;
    } catch (e) {
      return null;
    }
  },
  clearAuthToken: () => {
    try {
      localStorage.removeItem(BASE_KEYS.AUTH);
    } catch (e) {}
  },

  // DB History - Mimics Redis Lookup
  getHistory: (config: DbConfig): HistoryRecord[] | null => {
    if (!config.redis?.enabled) return null; // If Redis disabled, always miss cache

    try {
      const key = getDbKey(config);
      const data = localStorage.getItem(key);
      if (data) {
        console.log(`[Redis] HIT: ${key}`);
        return JSON.parse(data);
      }
      console.log(`[Redis] MISS: ${key}`);
      return null;
    } catch (e) {
      return null;
    }
  },

  saveHistory: (config: DbConfig, history: HistoryRecord[]) => {
    if (!config.redis?.enabled) return;
    const key = getDbKey(config);
    localStorage.setItem(key, JSON.stringify(history));
    console.log(`[Redis] SET: ${key}`);
  },

  // Scripts - Mimics File System Cache or Redis Cache for scripts
  getScripts: (path: string, config: DbConfig): ScriptFile[] | null => {
     if (!config.redis?.enabled) return null;

     try {
       const key = getScriptKey(path);
       const data = localStorage.getItem(key);
       return data ? JSON.parse(data) : null;
     } catch (e) {
       return null;
     }
  },

  saveScripts: (path: string, scripts: ScriptFile[], config: DbConfig) => {
    if (!config.redis?.enabled) return;
    const key = getScriptKey(path);
    localStorage.setItem(key, JSON.stringify(scripts));
  }
};
