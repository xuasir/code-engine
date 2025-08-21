import type { CodeEngineModule, ModuleOptions } from './module'

export interface ConfigSchema {
  /** 配置继承 */
  extends: string
  /** 项目根目录 */
  rootDir: string
  /** 扩展模块 */
  modules: Array<CodeEngineModule | string | [CodeEngineModule, ModuleOptions] | [string, ModuleOptions]>
  /** debug 模式 */
  debug: boolean
  /**
   * 配置文件路径
   * @private
   */
  _configFile: string
}
