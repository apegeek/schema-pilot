
export enum MigrationStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  FUTURE = 'FUTURE'
}

export interface ScriptFile {
  id: string;
  version: string;
  description: string;
  name: string; // e.g., V1__Create_users.sql
  content: string;
  status: MigrationStatus;
  installedOn?: string;
  executionTime?: number;
  type: 'SQL';
  path: string; // logical path, e.g., "auth/tables"
}

export type DbType = 'MySQL' | 'PostgreSQL' | 'MariaDB' | 'Oracle';

export interface RedisConfig {
  enabled: boolean;
  host: string;
  port: string;
  password?: string;
  dbIndex: number;
}

export interface DbConfig {
  type: DbType;
  host: string;
  port: string;
  database: string;
  user: string;
  password?: string;
  schema: string;
  scriptsPath: string;
  appPassword?: string;
  redis?: RedisConfig; // New Redis Configuration
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface TreeItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: TreeItem[];
  data?: ScriptFile;
  path: string;
  isOpen?: boolean;
}

export interface HistoryRecord {
  installed_rank: number;
  version: string | null;
  description: string;
  type: string;
  script: string;
  checksum: number;
  installed_by: string;
  installed_on: string;
  execution_time: number;
  success: boolean;
}
