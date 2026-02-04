import type { Vona } from './engine'
import type { VonaHooks } from './hooks'

export interface ModuleMeta {
  /** 模块名称 */
  name: string
  /** 模块版本 */
  version: string

  /** 配置文件 key */
  configKey?: string

  [key: string]: unknown
}

/** 模块选项 */
export type ModuleOptions = Record<string, any>

/** 模块安装结果 */
export interface ModuleSetupInstallResult {
  /**
   * 初始设置的定时信息
   */
  timings?: {
    /** 模块设置所花费的总时间 */
    setup?: number
    [key: string]: number | undefined
  }
}

type Awaitable<T> = T | Promise<T>

export type ModuleSetupReturn = Awaitable<false | void | ModuleSetupInstallResult>

/** 模块定义 */
export interface ModuleDefinition<
  TOptions extends ModuleOptions,
  TOptionsDefaults extends Partial<TOptions>,
> {
  meta: ModuleMeta
  defaults?: TOptionsDefaults | ((ce: Vona) => Awaitable<TOptionsDefaults>)
  schema?: TOptions
  hooks?: Partial<VonaHooks>
  setup?: (
    this: void,
    resolvedOptions: TOptions,
    ce: Vona
  ) => ModuleSetupReturn
}

/** 实例 */
export interface VonaModule<
  TOptions extends ModuleOptions = ModuleOptions,
> {
  (
    this: void,
    resolvedOptions: TOptions,
    ce: Vona
  ): ModuleSetupReturn
  getOptions?: (
    inlineOptions?: Partial<TOptions>,
    ce?: Vona
  ) => Promise<TOptions>
  getMeta?: () => Promise<ModuleMeta & { configKey: string }>
}
