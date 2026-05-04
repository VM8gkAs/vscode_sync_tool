import * as vscode from "vscode";
import { DeployConfigItem, FileTransferConfigItem, Permissions } from "./types/config";
export declare function sleep(ms?: number): Promise<unknown>;
/** 深拷贝配置/任务对象（优先 structuredClone） */
export declare function deepClone<T>(obj: T): T;
export declare const oConsole: {
    log: (...message: any[]) => void;
    succeed: (...message: any[]) => void;
    info: (...message: any[]) => void;
    error: (...message: any[]) => void;
};
export declare const getPluginSetting: () => vscode.WorkspaceConfiguration;
/**
 * 根据项目根路径生成唯一目录名：basename-shortHash
 * 用于在外部存储目录下区分同名项目
 */
export declare function getProjectDirName(rootPath: string): string;
/**
 * 获取当前项目的配置文件完整路径
 * - 若用户未设置 configStorePath，则使用项目根目录
 * - 若设置了 configStorePath，则放在 configStorePath/projectDirName/ 下
 */
export declare function getConfigFilePath(rootPath?: string): string;
/**
 * 确保配置文件所在目录存在
 */
export declare function ensureConfigDir(configFilePath: string): void;
export declare const showInformationMessage: (msg: string, confirmText?: string, cancelText?: string) => Promise<unknown>;
/**
 * 获取根路径；多工作区时若传入 file 则匹配包含该文件的工作区根目录
 */
export declare function getRootPath(file?: string): string;
/**
 * 语言字符
 */
export declare const getLang: (lang: string, param?: any) => string;
/**
 * 获取某个目录下所有文件
 * @param dir
 * @param is_ignore 是否需要忽略文件或文件夹
 * @param ignore_arr
 * @returns
 */
export declare const getAllFiles: (dir: string, is_ignore?: boolean, ignore_arr?: string[]) => Promise<string[]>;
/**
 * 获取需要上传的文件
 * @param context
 * @param obj
 * @param rootPath
 * @param file
 * @returns
 */
export declare const getAllowFiles: (config: FileTransferConfigItem, file: string, view?: boolean) => Promise<false | string[]>;
export declare const isIgnore: (ignore_arr: string[] | undefined, file: string, flag?: boolean) => Promise<boolean>;
export declare const getIgnoreConfig: (config: FileTransferConfigItem, file?: string, view?: boolean) => any[] | Promise<string[]>;
export declare const toArray: (obj: {
    [x: string]: any;
}, rootPath?: string) => FileTransferConfigItem[];
/**
 * 添加配置
 * @param context  上下文
 * @param rootPath 项目路径
 * @returns
 */
export declare function addConfig(rootPath: string): Promise<void>;
/**
 * 获取用户配置
 * @param context  上下文
 * @param rootPath 项目路径
 * @param type 创建配置文件 1需要 2不需要
 * @param showErr 显示异常 1需要 2不需要
 * @returns
 */
export declare function getUserConfig(type?: number, showErr?: number, explicitRootPath?: string): Promise<any>;
/** 清除指定 rootPath（或全部工作区）的配置缓存 */
export declare function clearConfigCache(rootPath?: string): void;
export declare const checkSubmitGit: (workspaceRoot: string, config: DeployConfigItem) => Promise<unknown>;
export declare function inputMsg(option: vscode.InputBoxOptions, isGit?: boolean): Promise<string>;
export declare const getFileSizeFsExtra: (filePath: string) => Promise<number | null>;
export declare const verityConfig: (config: DeployConfigItem) => Promise<void>;
/**
 * 判断是否需要上传到根目录
 * @param config 部署配置项
 * @param remotePath 远程路径
 * @param rootPath 根路径
 * @returns 返回一个对象，包含是否需要上传到根目录的布尔值 up_to_root 和处理后的远程路径 remotePath
 */
export declare const isUpRoot: (config: DeployConfigItem, remotePath: string, rootPath: string) => {
    up_to_root: boolean;
    remotePath: string;
};
/**
 * 防抖函数，通过延迟执行函数，避免函数在短时间内被频繁调用。
 * @param fn 需要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @param immediate 是否立即执行第一次调用，默认为 false，即延迟执行
 * @returns 返回一个新的函数，该函数在延迟时间内多次调用时，只会在最后一次调用延迟时间结束后执行一次
 */
export declare function debounce<T extends (...args: any[]) => any>(fn: T, delay: number, immediate?: boolean): (...args: Parameters<T>) => void;
/**
 * 节流函数，用于限制函数的执行频率
 * @param func 需要被节流的函数
 * @param wait 节流时间间隔，单位毫秒
 * @returns 返回一个新的函数，该函数会在指定的时间间隔内最多只执行一次原函数
 */
export declare function throttle<T extends (...args: any[]) => any>(func: T, wait: number): (this: any, ...args: Parameters<T>) => void;
export declare function formatFileSize(bytes: number): string;
export declare function getUseTime(date: string | undefined): string;
export declare function splitPath(path: string): string[];
export declare function getParentPath(filepath: string): string;
export declare function sortFiles(filesArr: any[], isNested?: boolean): any[];
/**
 * 检查Linux文件或目录权限是否在有效的000-777范围内
 * @param {string|number} permissions - 权限值
 * @returns {boolean} 是否为有效权限
 */
export declare function isValidLinuxPermission(permissions: string | number): boolean;
export declare function permissionsToOctal(permissions: Permissions): string;
export declare const getNormalPath: (remotePath: string) => string;
/** 生成随机密钥字符串（密码学安全） */
export declare function generateRandomPassword(length: number): string;
//# sourceMappingURL=utils.d.ts.map