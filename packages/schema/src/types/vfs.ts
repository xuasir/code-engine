import type { Hookable } from 'hookable'

/**
 * 节点类型枚举
 * - reference: 引用模式,指向物理磁盘路径
 * - entity: 实体模式,由函数/字符串生成的内存内容
 */
export type VfsKind = 'reference' | 'entity'

/**
 * VFS 数据源类型
 * - string: 物理路径(引用模式)或静态内容(实体模式)
 * - function: 生成器函数(实体模式)
 */
export type VfsSource = string | (() => string | Promise<string>)

export interface VfsRecord {
  /** 虚拟路径 (例如 /components/Button.vue) */
  path: string
  /** 节点类型 */
  kind: VfsKind
  /** 数据源 */
  source: VfsSource

  // === 元数据 ===
  /** 唯一标识 (用于去重/追踪) */
  key: string
  /** Layer 名称 (e.g., 'app', 'base') */
  layer?: string
  /** 原始物理路径 (用于 watcher 关联) */
  originalPath?: string
  /** 扫描时使用的 pattern */
  pattern?: string
  /** 来源方式 */
  sourceType: 'mount' | 'write' | 'template'

  // === 状态 ===
  /** 优先级 */
  priority: number
  /** Scope 名称 */
  scope?: string
  /** 依赖的文件模式(用于实体模式自动重算) */
  watch?: string[]
}

/**
 * VFS 模板定义
 */
export interface VfsTemplate {
  /** 虚拟路径 */
  path: string
  /** 依赖的文件模式 */
  watch?: string[]
  /** 生成器函数 */
  get: (ctx: VfsTemplateContext) => string | Promise<string>
}

/**
 * 模板生成上下文
 */
export interface VfsTemplateContext {
  /** VFS 实例引用 */
  vfs: VFS
}

/**
 * VFS Scope 上下文
 */
export interface VfsScopeContext {
  /** Scope 名称 (通常对应 Layer 名称) */
  name?: string
  /** 基础优先级 */
  priority?: number

  /**
   * 创建子 Scope
   */
  scope: (options: { name?: string, priority?: number }) => VfsScopeContext

  /**
   * 挂载单个文件(引用模式)
   * @param virtualPath 虚拟路径
   * @param physicalPath 物理路径
   * @param options 元数据选项
   */
  mount: (virtualPath: string, physicalPath: string, options?: {
    priority?: number
    originalPath?: string
    pattern?: string
  }) => void

  /**
   * 写入单个文件(实体模式)
   * @param virtualPath 虚拟路径
   * @param content 文件内容或生成器
   * @param priority 优先级覆盖(可选)
   */
  write: (virtualPath: string, content: VfsSource, priority?: number) => void

  /**
   * 添加模板文件(实体模式 + 响应式依赖)
   * @param template 模板定义
   */
  addTemplate: (template: VfsTemplate) => void

  /**
   * 移除文件
   * @param virtualPath 虚拟路径
   */
  remove: (virtualPath: string) => void
}

/**
 * VFS 事件钩子
 */
export interface VfsHooks {
  /**
   * 文件添加事件
   */
  'file:added': (record: VfsRecord) => void | Promise<void>

  /**
   * 文件更新事件
   */
  'file:updated': (record: VfsRecord) => void | Promise<void>

  /**
   * 文件移除事件
   */
  'file:removed': (path: string) => void | Promise<void>
}

/**
 * VFS 调试信息
 */
export interface VfsInspectResult {
  /** 虚拟路径 */
  path: string
  /** 节点类型 */
  kind: VfsKind
  /** 当前生效的数据源 */
  activeSource: VfsSource
  /** 当前生效的优先级 */
  activePriority: number
  /** 当前生效的 Scope */
  activeScope?: string
  /** 历史记录(所有注册过的源) */
  history: Array<{
    scope?: string
    source: VfsSource
    priority: number
  }>
}

/**
 * VFS 主接口
 */
export interface VFS extends VfsScopeContext {
  /** 事件钩子系统 */
  hooks: Hookable<VfsHooks>

  /**
   * 读取单个文件
   * @param path 虚拟路径
   * @returns 文件记录,不存在时返回 undefined
   */
  read: (path: string) => VfsRecord | undefined

  /**
   * 模式匹配查询 (基于内存中的虚拟文件)
   * @param pattern Glob 模式
   * @returns 匹配的文件记录数组
   */
  glob: (pattern: string) => VfsRecord[]

  /**
   * 查看文件调试信息
   * @param path 虚拟路径
   * @returns 调试信息,不存在时返回 undefined
   */
  inspect: (path: string) => VfsInspectResult | undefined

  /**
   * 应用 VFS Setup
   * @param setup VFS Setup 函数
   */
  use: (setup: VfsSetup) => void | Promise<void>
}

/**
 * VFS 创建选项
 */
export interface VfsOptions {
  /** 根目录 */
  root: string
  /** 是否为开发模式 */
  isDev?: boolean
}

/**
 * VFS Setup 函数 (原 VfsModule)
 * 负责执行 IO 扫描并注册文件
 */
export type VfsSetup = (ctx: VfsScopeContext) => void | Promise<void>

/**
 * VFS Setup 定义辅助函数类型
 */
export type DefineVfsSetup = (setup: VfsSetup) => VfsSetup
