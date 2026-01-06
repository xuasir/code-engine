import type { Hookable } from 'hookable'
import type { AsyncLocalStorage } from 'node:async_hooks'
import type { CodeEngineOptions } from './config'
import type { CodeEngineEnv } from './env'
import type { CodeEngineHooks } from './hooks'
import type { CodeEngineModule } from './module'
import type { VFS } from './vfs'

export interface CodeEngine {
  // 内部字段
  /** 名称 */
  __name: string
  /** 版本 */
  __version: string
  /** 当前运行的 CodeEngine 模块实例的 AsyncLocalStorage */
  __asyncLocalStorageModule: AsyncLocalStorage<CodeEngineModule>
  /** 依赖 */
  __dependencies?: Set<string>

  /** 加载后的配置 */
  options: CodeEngineOptions
  /** 钩子 */
  hooks: Hookable<CodeEngineHooks>
  hook: CodeEngine['hooks']['hook']
  /** 触发钩子 */
  callHook: CodeEngine['hooks']['callHook']
  addHooks: CodeEngine['hooks']['addHooks']
  /** 基于上下文运行 */
  runWithContext: <T extends (...args: any[]) => any>(fn: T) => ReturnType<T>

  /** 虚拟文件系统 */
  vfs: VFS

  /** 环境 */
  env: CodeEngineEnv

  /** 生命周期 */
  ready: () => Promise<void>
  close: () => Promise<void>
}
