import type { SchemaDefinition } from 'untyped'
import type { VonaMode } from './env'
import type { LayerDefinition } from './layer'
import type { ModuleMeta, ModuleOptions, ModuleSetupInstallResult, VonaModule } from './module'
import type { ConfigSchema } from './schema'

// eslint-disable-next-line ts/no-unsafe-function-type
type DeepPartial<T> = T extends Function ? T : T extends Record<string, any> ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export interface VonaConfig extends DeepPartial<ConfigSchema> {
  /** 配置 */
  $schema?: SchemaDefinition
}

export interface VonaOptions extends ConfigSchema {
  /** 项目根目录 */
  __rootDir: string
  /** 模式 */
  __mode: VonaMode
  /** 当前命令 */
  __command?: {
    name: string
    args: Record<string, any>
  }
  /**
   * 代码工程的层
   */
  __layers: LayerDefinition[]
  /**
   * 内部模块
   */
  __internalModules: Array<VonaModule | [VonaModule, ModuleOptions]>
  /**
   * 加载过的模块
   */
  __requiredModules: Record<string, boolean>
  /**
   * 安装过的模块
   */
  __installedModules: Array<{
    meta: ModuleMeta
    module: VonaModule
    timings: ModuleSetupInstallResult['timings']
  }>
  /** 配置 */
  $schema?: SchemaDefinition
}
