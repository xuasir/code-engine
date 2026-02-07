import type { Hookable } from 'hookable'
import type { AsyncLocalStorage } from 'node:async_hooks'
import type { LayerAsset, ResourceManifest } from './asset'
import type { VonaOptions } from './config'
import type { VonaEnv } from './env'
import type { VonaHooks } from './hooks'
import type { ResourceType } from './layer'
import type { VonaModule } from './module'

export interface VonaOVFS {
  resolve: (key: string) => LayerAsset | undefined
  resolveAll: (key: string) => LayerAsset[]
  list: (type?: ResourceType) => string[]
  getByType: (type: ResourceType) => LayerAsset[]
  allTypes: () => ResourceType[]
  stats: () => { totalResources: number, byType: Record<ResourceType, number> }
  toManifest: () => ResourceManifest
}

export interface Vona {
  // 内部字段
  /** 名称 */
  __name: string
  /** 版本 */
  __version: string
  /** 当前运行的 Vona 模块实例的 AsyncLocalStorage */
  __asyncLocalStorageModule: AsyncLocalStorage<VonaModule>
  /** 依赖 */
  __dependencies?: Set<string>

  /** 加载后的配置 */
  options: VonaOptions
  /** 钩子 */
  hooks: Hookable<VonaHooks>
  hook: Vona['hooks']['hook']
  /** 触发钩子 */
  callHook: Vona['hooks']['callHook']
  addHooks: Vona['hooks']['addHooks']
  /** 基于上下文运行 */
  runWithContext: <T extends (...args: any[]) => any>(fn: T) => ReturnType<T>

  /** OVFS 实例 */
  ovfs?: VonaOVFS

  /** 环境 */
  env: VonaEnv

  /** 生命周期 */
  ready: () => Promise<void>
  close: () => Promise<void>
}
