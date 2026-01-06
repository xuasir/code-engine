import type { SchemaDefinition } from 'untyped'
import type { CodeEngineLayerDefinition } from './layer'
import type { CodeEngineModule, ModuleMeta, ModuleOptions, ModuleSetupInstallResult } from './module'
import type { ConfigSchema } from './schema'

// eslint-disable-next-line ts/no-unsafe-function-type
type DeepPartial<T> = T extends Function ? T : T extends Record<string, any> ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export interface CodeEngineConfig extends DeepPartial<ConfigSchema> {
  /** 配置 */
  $schema?: SchemaDefinition
}

export interface CodeEngineOptions extends ConfigSchema {
  /** 当前命令 */
  _command?: {
    name: string
    args: Record<string, any>
  }
  /**
   * 代码工程的层
   */
  _layers: CodeEngineLayerDefinition[]
  /**
   * 内部模块
   */
  __internalModules: Array<CodeEngineModule | [CodeEngineModule, ModuleOptions]>
  /**
   * 加载过的模块
   */
  __requiredModules: Record<string, boolean>
  /**
   * 安装过的模块
   */
  __installedModules: Array<{
    meta: ModuleMeta
    module: CodeEngineModule
    timings: ModuleSetupInstallResult['timings']
  }>
  /** 配置 */
  $schema?: SchemaDefinition
}
