import type { SchemaDefinition } from 'untyped'
import type { CodeEngineModule, ModuleMeta, ModuleOptions, ModuleSetupInstallResult } from './module'
import type { ConfigSchema } from './schema'

export interface CodeEngineLayer {
  /** 层工作目录 */
  cwd: string
}

export interface CodeEngineConfig extends ConfigSchema {
  /** 配置 */
  $schema?: SchemaDefinition
}

export interface CodeEngineOptions extends ConfigSchema {
  /**
   * 代码工程的层
   */
  _layers: CodeEngineLayer[]
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
