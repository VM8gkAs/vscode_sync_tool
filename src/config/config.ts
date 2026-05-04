// 自定义协议
export const URI_SCHEME = 'async-tools';

// 缓存目录
export const CACHE_DIRNAME = 'sync_tools';

/** 配置文件名 */
export const CONFIG_FILENAME = 'sync_config.jsonc';

/** 任务完成状态栏提示延迟（ms） */
export const TASK_COMPLETE_UI_DELAY_MS = 1500;
/** 全部任务完成检查与清理延迟（ms） */
export const ALL_TASKS_COMPLETE_DELAY_MS = 2500;
/** 下载后跳过本地上传监听的冷却（ms） */
export const NO_UPLOAD_COOLDOWN_MS = 3000;
/** 压缩包生成后从 noUploadFiles 移除的延迟（ms） */
export const ZIP_NO_UPLOAD_CLEAR_MS = 2000;
/** 连接池清理间隔（ms） */
export const CONNECTION_POOL_CLEANUP_INTERVAL_MS = 60 * 1000;

