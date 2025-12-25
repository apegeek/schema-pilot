
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
    collapse_tooltip: string;
    expand_tooltip: string;
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
    merge_tooltip: string;
    delete_tooltip: string;
    delete_confirm_title: string;
    delete_confirm_desc: string;
    delete_confirm_btn: string;
    logout_confirm_title: string;
    logout_confirm_desc: string;
    logout_confirm_btn: string;
  };
  config: {
    title: string;
    tab_db: string;
    tab_redis: string;
    tab_ai: string;
    tab_prompt: string;
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
    ai_title: string;
    ai_provider: string;
    ai_model: string;
    ai_api_key: string;
    ai_test_btn: string;
    ai_testing: string;
    ai_test_success: string;
    ai_test_fail: string;
    ai_test_idle: string;
    prompt_desc: string;
    prompt_load_default: string;
    prompt_save: string;
    prompt_save_success: string;
    prompt_save_fail: string;
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
    btn_apply_fix: string;
    ai_fix_not_found: string;
    btn_insert_ai_hint: string;
    btn_accept_fix: string;
    btn_reject_fix: string;
    gen_open: string;
    gen_title: string;
    gen_desc_label: string;
    gen_desc_placeholder: string;
    gen_generate: string;
    gen_output_title: string;
    thinking: string;
    gen_save: string;
    gen_cancel: string;
    prompt_open: string;
    prompt_title: string;
    prompt_load_default: string;
    prompt_save: string;
    prompt_save_success: string;
    prompt_save_fail: string;
    ai_reanalyze: string;
    no_selection_title: string;
    no_selection_desc: string;
    hint_merge_pending: string;
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
    batch_merge: string;
  };
  logs: {
    title: string;
    empty: string;
    resize_tooltip: string;
  };
  confirm: {
    danger_title: string;
    danger_desc: string;
    confirm: string;
    cancel: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    login: {
      title: "SchemaPilot Studio",
      subtitle: "Database Migration Visualization Workbench",
      label_password: "Admin Password",
      placeholder: "Enter password...",
      btn_login: "Access System",
      error_password: "Incorrect password. Please try again.",
      footer_default: "Default password:",
    },
    sidebar: {
      title: "SchemaPilot Studio",
      refresh_tooltip: "Refresh Cache & State",
      config_tooltip: "Configure Database",
      collapse_tooltip: "Collapse sidebar",
      expand_tooltip: "Expand sidebar",
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
      resize_tooltip: "Drag to resize",
      merge_tooltip: "Merge pending scripts",
      delete_tooltip: "Delete script",
      delete_confirm_title: "Confirm Deletion",
      delete_confirm_desc: "This action will permanently remove the file.",
      delete_confirm_btn: "Delete",
      logout_confirm_title: "Confirm Logout",
      logout_confirm_desc: "You will be signed out; unsaved changes may be lost.",
      logout_confirm_btn: "Logout"
    },
    config: {
      title: "System Configuration",
      tab_db: "Database",
      tab_redis: "Cache (Redis)",
      tab_ai: "AI Model",
      tab_prompt: "AI Prompt",
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
      ai_title: "AI Configuration",
      ai_provider: "Provider",
      ai_model: "Default Model",
      ai_api_key: "API Key",
      ai_test_btn: "Test AI",
      ai_testing: "Testing AI...",
      ai_test_success: "AI is reachable!",
      ai_test_fail: "AI test failed",
      ai_test_idle: "Configure provider, key and model, then test.",
      prompt_desc: "Edit the expert prompt used for SQL analysis.",
      prompt_load_default: "Load Default",
      prompt_save: "Save",
      prompt_save_success: "Prompt saved",
      prompt_save_fail: "Save failed",
    },
    editor: {
      status_applied: "Applied",
      status_pending: "Merge Pending",
      btn_save: "Save",
      btn_migrate: "Migrate",
      btn_migrating: "Migrating...",
      tab_sql: "SQL Script",
      tab_ai: "AI Analysis",
      readonly_alert: "Read-only: Script already applied",
      ai_analyzing: "AI is analyzing your schema changes...",
      ai_title: "Migration Analysis",
      ai_desc_start: "Gemini is analyzing",
      ai_desc_end: "...",
      btn_upload: "Upload",
      btn_fullscreen: "Fullscreen",
      btn_exit_fullscreen: "Exit Fullscreen",
      btn_apply_fix: "Apply Fix & Save",
      ai_fix_not_found: "No SQL fix snippet found in AI output",
      btn_insert_ai_hint: "Insert AI Suggestions as comment",
      btn_accept_fix: "Accept Fix",
      btn_reject_fix: "Reject",
      gen_open: "AI Generate SQL",
      gen_title: "Generate DDL from requirements",
      gen_desc_label: "Describe your table/design requirements",
      gen_desc_placeholder: "Entities, fields, constraints, indexes, relationships...",
      gen_generate: "Generate",
      gen_output_title: "Generated SQL",
      thinking: "Thinking...",
      gen_save: "Save as new version",
      gen_cancel: "Cancel",
      prompt_open: "Edit Prompt",
      prompt_title: "Expert Prompt for Analysis",
      prompt_load_default: "Load Default",
      prompt_save: "Save",
      prompt_save_success: "Prompt saved",
      prompt_save_fail: "Save failed",
      ai_reanalyze: "Run Analysis",
      no_selection_title: "No script selected",
      no_selection_desc: "Select a script from the left, or use \"AI Generate SQL\" above",
      hint_merge_pending: "Merge-pending scripts are editable; save changes directly.",
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
      empty: "No history records found.",
      batch_merge: "Batch Migrate"
    },
    logs: {
      title: "Execution Logs",
      empty: "No logs generated yet.",
      resize_tooltip: "Drag to adjust height"
    },
    confirm: {
      danger_title: "Confirm Risky Operation",
      danger_desc: "Potential destructive SQL detected (DROP/TRUNCATE/UPDATE/DELETE without WHERE). Continue?",
      confirm: "Confirm",
      cancel: "Cancel"
    }
  },
  zh: {
    login: {
      title: "SchemaPilot Studio",
      subtitle: "数据库迁移可视化工作台",
      label_password: "管理员密码",
      placeholder: "请输入密码...",
      btn_login: "进入系统",
      error_password: "密码错误，请重试。",
      footer_default: "默认密码：",
    },
    sidebar: {
      title: "SchemaPilot Studio",
      refresh_tooltip: "刷新缓存与状态",
      config_tooltip: "数据库配置",
      collapse_tooltip: "收起侧栏",
      expand_tooltip: "展开侧栏",
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
      resize_tooltip: "拖拽以调整宽度",
      merge_tooltip: "合并待执行脚本",
      delete_tooltip: "删除脚本",
      delete_confirm_title: "确认删除",
      delete_confirm_desc: "此操作将永久删除该文件。",
      delete_confirm_btn: "删除",
      logout_confirm_title: "确认登出",
      logout_confirm_desc: "将退出系统；未保存的更改可能会丢失。",
      logout_confirm_btn: "登出"
    },
    config: {
      title: "系统配置",
      tab_db: "数据库",
      tab_redis: "缓存 (Redis)",
      tab_ai: "AI 模型",
      tab_prompt: "提示词",
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
      ai_title: "AI 配置",
      ai_provider: "服务商",
      ai_model: "默认模型",
      ai_api_key: "API 密钥",
      ai_test_btn: "测试 AI",
      ai_testing: "AI 测试中...",
      ai_test_success: "AI 可用！",
      ai_test_fail: "AI 测试失败",
      ai_test_idle: "填写服务商、密钥与模型后进行测试。",
      prompt_desc: "编辑用于 SQL 分析的资深专家提示词。",
      prompt_load_default: "加载默认",
      prompt_save: "保存",
      prompt_save_success: "已保存",
      prompt_save_fail: "保存失败",
    },
    editor: {
      status_applied: "已应用",
      status_pending: "待合并",
      btn_save: "保存",
      btn_migrate: "执行迁移",
      btn_migrating: "迁移中...",
      tab_sql: "SQL 脚本",
      tab_ai: "AI 智能分析",
      readonly_alert: "只读模式：脚本已应用",
      ai_analyzing: "AI 正在分析您的 Schema 变更...",
      ai_title: "迁移影响分析",
      ai_desc_start: "Gemini 正在分析",
      ai_desc_end: "...",
      btn_upload: "上传",
      btn_fullscreen: "全屏",
      btn_exit_fullscreen: "退出全屏",
      btn_apply_fix: "应用修复并保存",
      ai_fix_not_found: "AI 输出中未找到 SQL 修复片段",
      btn_insert_ai_hint: "插入AI建议为注释并保存",
      btn_accept_fix: "接受修复",
      btn_reject_fix: "拒绝",
      gen_open: "AI 生成 SQL",
      gen_title: "根据需求生成 DDL",
      gen_desc_label: "描述你的表/设计需求",
      gen_desc_placeholder: "实体、字段、约束、索引、关系...",
      gen_generate: "生成",
      gen_output_title: "生成的 SQL",
      thinking: "思考中...",
      gen_save: "保存为新版本",
      gen_cancel: "取消",
      prompt_open: "编辑提示词",
      prompt_title: "用于分析的资深专家提示词",
      prompt_load_default: "加载默认",
      prompt_save: "保存",
      prompt_save_success: "已保存",
      prompt_save_fail: "保存失败",
      ai_reanalyze: "AI分析",
      no_selection_title: "尚未选择脚本",
      no_selection_desc: "请在左侧选择脚本，或点击上方“AI 生成 SQL”创建",
      hint_merge_pending: "待合并脚本支持直接编辑并保存。",
    },
    history: {
      title: "Flyway 版本历史",
      subtitle: "数据源自",
      col_rank: "顺序",
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
      empty: "暂无历史记录。",
      batch_merge: "批量合并"
    },
    logs: {
      title: "执行日志",
      empty: "暂无日志。",
      resize_tooltip: "拖拽以调整高度"
    },
    confirm: {
      danger_title: "危险操作确认",
      danger_desc: "检测到可能存在破坏性操作（DROP/TRUNCATE/无 WHERE 的 UPDATE/DELETE 等）。确认继续执行迁移吗？",
      confirm: "确定",
      cancel: "取消"
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
