import type {
  VFS,
  VfsHooks,
  VfsInspectResult,
  VfsOptions,
  VfsRecord,
  VfsScopeContext,
  VfsSetup,
  VfsSource,
  VfsTemplate,
} from '@a-sir/code-engine-schema'
import { createHooks } from 'hookable'
import micromatch from 'micromatch'
import { hash } from 'ohash'

/**
 * VFS 实现类
 */
class VFSImpl implements VFS {
  /** 事件钩子系统 */
  public hooks = createHooks<VfsHooks>()

  /** 扁平化文件存储 Map */
  private files = new Map<string, VfsRecord>()

  /** 文件历史记录(用于调试) */
  private history = new Map<string, VfsRecord[]>()

  /** 根目录 */
  private root: string

  /** 是否为开发模式 */
  private isDev: boolean

  /** 默认优先级 */
  protected basePriority = 0

  /** Scope 名称 */
  public name?: string

  constructor(options: VfsOptions) {
    this.root = options.root
    this.isDev = options.isDev ?? false
  }

  /**
   * 创建子 Scope
   */
  scope(options: { name?: string, priority?: number }): VfsScopeContext {
    return new VfsScopeImpl(this, {
      name: options.name,
      basePriority: options.priority ?? this.basePriority,
    })
  }

  /**
   * 挂载单个文件(引用模式)
   */
  mount(virtualPath: string, physicalPath: string, options?: { priority?: number, originalPath?: string, pattern?: string }): void {
    const priority = options?.priority ?? this.basePriority
    const path = this.normalizePath(virtualPath)

    this.update({
      key: hash({ path, priority, scope: this.name }), // 生成唯一 key
      path,
      kind: 'reference',
      source: physicalPath,
      priority,
      scope: this.name,
      originalPath: options?.originalPath,
      pattern: options?.pattern,
      sourceType: 'mount',
      layer: this.name, // 假设 Scope name 等同于 Layer name
    })
  }

  /**
   * 写入单个文件(实体模式)
   */
  write(virtualPath: string, content: VfsSource, priority?: number): void {
    const p = priority ?? this.basePriority
    const path = this.normalizePath(virtualPath)

    this.update({
      key: hash({ path, priority: p, scope: this.name }),
      path,
      kind: 'entity',
      source: content,
      priority: p,
      scope: this.name,
      sourceType: 'write',
      layer: this.name,
    })
  }

  /**
   * 添加模板文件(实体模式 + 响应式依赖)
   */
  addTemplate(template: VfsTemplate): void {
    const path = this.normalizePath(template.path)

    this.update({
      key: hash({ path, priority: this.basePriority, scope: this.name }),
      path,
      kind: 'entity',
      source: () => template.get({ vfs: this }),
      priority: this.basePriority,
      scope: this.name,
      watch: template.watch,
      sourceType: 'template',
      layer: this.name,
    })
  }

  /**
   * 移除文件
   */
  remove(virtualPath: string): void {
    const normalizedPath = this.normalizePath(virtualPath)
    const existed = this.files.has(normalizedPath)

    if (existed) {
      this.files.delete(normalizedPath)
      this.hooks.callHook('file:removed', normalizedPath)
    }
  }

  /**
   * 读取单个文件
   */
  read(path: string): VfsRecord | undefined {
    return this.files.get(this.normalizePath(path))
  }

  /**
   * 模式匹配查询
   */
  glob(pattern: string): VfsRecord[] {
    const results: VfsRecord[] = []
    const normalizedPattern = this.normalizePath(pattern)

    for (const [path, record] of this.files) {
      if (micromatch.isMatch(path, normalizedPattern)) {
        results.push(record)
      }
    }

    return results
  }

  /**
   * 查看文件调试信息
   */
  inspect(path: string): VfsInspectResult | undefined {
    const normalizedPath = this.normalizePath(path)
    const current = this.files.get(normalizedPath)
    const historyRecords = this.history.get(normalizedPath)

    if (!current) {
      return undefined
    }

    return {
      path: normalizedPath,
      kind: current.kind,
      activeSource: current.source,
      activePriority: current.priority,
      activeScope: current.scope,
      history: (historyRecords || []).map(record => ({
        scope: record.scope,
        source: record.source,
        priority: record.priority,
      })),
    }
  }

  /**
   * 应用 VFS Setup
   */
  async use(setup: VfsSetup): Promise<void> {
    await setup(this)
  }

  /**
   * 更新文件记录(内部方法)
   * 处理优先级冲突和事件触发
   */
  private update(record: VfsRecord): void {
    const existing = this.files.get(record.path)

    // 记录历史
    if (!this.history.has(record.path)) {
      this.history.set(record.path, [])
    }
    this.history.get(record.path)!.push(record)

    // 优先级判断:只有当新记录优先级 >= 现有记录优先级时才覆盖
    if (!existing || record.priority >= existing.priority) {
      this.files.set(record.path, record)

      // 触发事件
      if (existing) {
        this.hooks.callHook('file:updated', record)
      }
      else {
        this.hooks.callHook('file:added', record)
      }
    }
  }

  /**
   * 规范化路径
   */
  private normalizePath(path: string): string {
    // 确保路径以 / 开头
    return path.startsWith('/') ? path : `/${path}`
  }

  /**
   * 内部方法:设置 basePriority(供 Scope 使用)
   */
  setBasePriority(priority: number, name?: string): void {
    this.basePriority = priority
    this.name = name
  }

  /**
   * 内部方法:获取 basePriority(供 Scope 使用)
   */
  getBasePriority(): number {
    return this.basePriority
  }
}

/**
 * VFS Scope 实现类
 */
class VfsScopeImpl implements VfsScopeContext {
  private vfs: VFSImpl
  private basePriority: number
  public name?: string

  constructor(vfs: VFSImpl, options: { name?: string, basePriority: number }) {
    this.vfs = vfs
    this.name = options.name
    this.basePriority = options.basePriority
  }

  scope(options: { name?: string, priority?: number }): VfsScopeContext {
    return new VfsScopeImpl(this.vfs, {
      name: options.name || this.name,
      basePriority: options.priority ?? this.basePriority,
    })
  }

  mount(virtualPath: string, physicalPath: string, options?: { priority?: number, originalPath?: string, pattern?: string }): void {
    this.vfs.mount(virtualPath, physicalPath, {
      priority: this.basePriority,
      ...options,
      // 只有在 explicit priority 覆盖时才使用 options.priority
      ...(options?.priority !== undefined ? { priority: options.priority } : {}),
    })
  }

  write(virtualPath: string, content: VfsSource, priority?: number): void {
    this.vfs.write(virtualPath, content, priority ?? this.basePriority)
  }

  addTemplate(template: VfsTemplate): void {
    // 临时保存当前优先级
    const originalPriority = this.vfs.getBasePriority()
    const originalName = this.vfs.name

    this.vfs.setBasePriority(this.basePriority, this.name)
    this.vfs.addTemplate(template)

    // 恢复原始状态
    this.vfs.setBasePriority(originalPriority, originalName)
  }

  remove(virtualPath: string): void {
    this.vfs.remove(virtualPath)
  }
}

/**
 * 创建 VFS 实例
 */
export function createVFS(options: VfsOptions): VFS {
  return new VFSImpl(options)
}

/**
 * 定义 VFS Setup
 */
export function defineVfsSetup(setup: VfsSetup): VfsSetup {
  return setup
}
