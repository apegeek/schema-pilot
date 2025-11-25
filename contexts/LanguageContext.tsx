
import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'zh' | 'en';

interface Translations {
  login: {
    title: string;
    subtitle: string;
    label_password: string;
    placeholder: string;
    btn_login: string;
    error_password: string;
    footer_default: string;
  };
  sidebar: {
    title: string;
    refresh_tooltip: string;
    config_tooltip: string;
    logout_tooltip: string;
    loading: string;
    btn_history: string;
    btn_scripts: string;
    header_tree: string;
    header_files: string;
    no_scripts: string;
    history_title: string;
    history_desc: string;
    back_link: string;
    upload_tooltip: string;
    resize_tooltip: string;
  };
  config: {
    title: string;
    tab_db: string;
    tab_redis: string;
    tab_security: string;
    db_type: string;
    db_schema: string;
    db_host: string;
    db_port: string;
    db_name: string;
    db_user: string;
    db_pass: string;
    fs_path: string;
    test_btn: string;
    testing: string;
    test_success: string;
    test_fail: string;
    test_idle: string;
    redis_enable: string;
    redis_desc: string;
    redis_host: string;
    redis_port: string;
    redis_pass: string;
    redis_db: string;
    redis_test_btn: string;
    redis_testing: string;
    redis_test_success: string;
    redis_test_fail: string;
    redis_test_idle: string;
    sec_title: string;
    sec_desc: string;
    sec_label: string;
    sec_hint: string;
    btn_save: string;
    btn_cancel: string;
  };
  editor: {
    status_applied: string;
    status_pending: string;
    btn_save: string;
    btn_migrate: string;
    btn_migrating: string;
    tab_sql: string;
    tab_ai: string;
    readonly_alert: string;
    ai_analyzing: string;
    ai_title: string;
    ai_desc_start: string;
    ai_desc_end: string;
    btn_upload: string;
    btn_fullscreen: string;
    btn_exit_fullscreen: string;
  };
  history: {
    title: string;
    subtitle: string;
    col_rank: string;
    col_version: string;
    col_desc: string;
    col_type: string;
    col_script: string;
    col_installed: string;
    col_time: string;
    col_state: string;
    col_success: string;
    state_success: string;
    state_fail: string;
    empty: string;
  };
  logs: {
    title: string;
    empty: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    login: {
      title: "Flyway Visualizer",
      subtitle: "Restricted Access Environment",
      label_password: "Admin Password",
      placeholder: "Enter password...",
      btn_login: "Access System",
      error_password: "Incorrect password. Please try again.",
      footer_default: "Default password:",
    },
    sidebar: {
      title: "FlywayHub",
      refresh_tooltip: "Refresh Cache & State",
      config_tooltip: "Configure Database",
      logout_tooltip: "Logout",
      loading: "Loading resources...",
      btn_history: "History",
      btn_scripts: "Scripts",
      header_tree: "Source Tree",
      header_files: "files",
      no_scripts: "No scripts found in this path.",
      history_title: "Database History",
      history_desc: "Viewing raw records from",
      back_link: "Back to Scripts",
      upload_tooltip: "Upload SQL script",
      resize_tooltip: "Drag to resize"
    },
    config: {
      title: "System Configuration",
      tab_db: "Database",
      tab_redis: "Cache (Redis)",
      tab_security: "Security",
      db_type: "Database Type",
      db_schema: "Schema",
      db_host: "Host",
      db_port: "Port",
      db_name: "Database Name",
      db_user: "Username",
      db_pass: "Password",
      fs_path: "Filesystem Scripts Path",
      test_btn: "Test Connection",
      testing: "Testing...",
      test_success: "Connection Successful!",
      test_fail: "Connection Failed",
      test_idle: "Verify your database connection settings.",
      redis_enable: "Redis Cache",
      redis_desc: "Enable caching for faster script retrieval",
      redis_host: "Redis Host",
      redis_port: "Port",
      redis_pass: "Auth Password (Optional)",
      redis_db: "DB Index",
      redis_test_btn: "Test Redis",
      redis_testing: "Pinging Redis...",
      redis_test_success: "Redis Connected!",
      redis_test_fail: "Redis Connection Failed",
      redis_test_idle: "Verify your Redis connection settings.",
      sec_title: "Access Control",
      sec_desc: "This demo is protected by a simple password for safety.",
      sec_label: "Admin Password",
      sec_hint: "Keep this value secure. Default is 'admin' for demo only.",
      btn_save: "Save",
      btn_cancel: "Cancel",
    },
    editor: {
      status_applied: "Applied",
      status_pending: "Pending",
      btn_save: "Save",
      btn_migrate: "Migrate",
      btn_migrating: "Migrating...",
      tab_sql: "SQL Script",
      tab_ai: "AI Analysis",
      readonly_alert: "Read-only: Script already applied",
      ai_analyzing: "Gemini is analyzing your schema changes...",
      ai_title: "Migration Analysis",
      ai_desc_start: "Gemini is analyzing",
      ai_desc_end: "...",
      btn_upload: "Upload",
      btn_fullscreen: "Fullscreen",
      btn_exit_fullscreen: "Exit Fullscreen"
    },
    history: {
      title: "Flyway Schema History",
      subtitle: "Raw data from",
      col_rank: "Rank",
      col_version: "Version",
      col_desc: "Description",
      col_type: "Type",
      col_script: "Script",
      col_installed: "Installed On",
      col_time: "Time (ms)",
      col_state: "State",
      col_success: "Success",
      state_success: "Success",
      state_fail: "Fail",
      empty: "No history records found."
    },
    logs: {
      title: "Execution Logs",
      empty: "No logs generated yet."
    }
  },
  zh: {
    login: {
      title: "Flyway 可视化工具",
      subtitle: "受限访问环境",
      label_password: "管理员密码",
      placeholder: "请输入密码...",
      btn_login: "进入系统",
      error_password: "密码错误，请重试。",
      footer_default: "默认密码：",
    },
    sidebar: {
      title: "Flyway控制台",
      refresh_tooltip: "刷新缓存与状态",
      config_tooltip: "数据库配置",
      logout_tooltip: "退出登录",
      loading: "资源加载中...",
      btn_history: "变更历史",
      btn_scripts: "脚本列表",
      header_tree: "脚本目录树",
      header_files: "个文件",
      no_scripts: "该路径下未找到脚本文件。",
      history_title: "数据库变更历史",
      history_desc: "数据来源表",
      back_link: "返回脚本列表",
      upload_tooltip: "上传 SQL 脚本",
      resize_tooltip: "拖拽以调整宽度"
    },
    config: {
      title: "系统配置",
      tab_db: "数据库",
      tab_redis: "缓存 (Redis)",
      tab_security: "安全",
      db_type: "数据库类型",
      db_schema: "Schema",
      db_host: "主机",
      db_port: "端口",
      db_name: "数据库名",
      db_user: "用户名",
      db_pass: "密码",
      fs_path: "脚本目录",
      test_btn: "测试连接",
      testing: "测试中...",
      test_success: "连接成功！",
      test_fail: "连接失败",
      test_idle: "请验证数据库连接配置。",
      redis_enable: "Redis 缓存",
      redis_desc: "启用缓存以加快脚本读取速度",
      redis_host: "Redis 主机",
      redis_port: "端口",
      redis_pass: "认证密码 (选填)",
      redis_db: "数据库索引 (DB Index)",
      redis_test_btn: "测试 Redis",
      redis_testing: "正在 Ping Redis...",
      redis_test_success: "Redis 连接成功！",
      redis_test_fail: "Redis 连接失败",
      redis_test_idle: "请验证 Redis 连接配置。",
      sec_title: "访问控制",
      sec_desc: "该演示通过简单密码保护。",
      sec_label: "管理员密码",
      sec_hint: "请妥善保管。演示默认 'admin'。",
      btn_save: "保存",
      btn_cancel: "取消",
    },
    editor: {
      status_applied: "已应用",
      status_pending: "待执行",
      btn_save: "保存",
      btn_migrate: "执行迁移",
      btn_migrating: "迁移中...",
      tab_sql: "SQL 脚本",
      tab_ai: "AI 智能分析",
      readonly_alert: "只读模式：脚本已应用",
      ai_analyzing: "Gemini 正在分析您的 Schema 变更...",
      ai_title: "迁移影响分析",
      ai_desc_start: "Gemini 正在分析",
      ai_desc_end: "...",
      btn_upload: "上传",
      btn_fullscreen: "全屏",
      btn_exit_fullscreen: "退出全屏"
    },
    history: {
      title: "Flyway 版本历史",
      subtitle: "数据源自",
      col_rank: "顺序 (Rank)",
      col_version: "版本号",
      col_desc: "描述",
      col_type: "类型",
      col_script: "脚本",
      col_installed: "执行时间",
      col_time: "耗时 (ms)",
      col_state: "状态",
      col_success: "成功",
      state_success: "成功",
      state_fail: "失败",
      empty: "暂无历史记录。"
    },
    logs: {
      title: "执行日志",
      empty: "暂无日志。"
    }
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
