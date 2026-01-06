import type { Schema, SchemaDefinition } from 'untyped'
import type { CodeEngine } from './engine'
import type { CodeEngineLayer, ScanTypeEnum } from './layer'

export type HookResult = Promise<void> | void

export interface CodeEngineHooks {
  /**
   * 代码引擎准备就绪
   * @param ce 代码引擎实例
   * @returns
   */
  'ready': (ce: CodeEngine) => HookResult
  /**
   * 代码引擎关闭
   * @param ce 代码引擎实例
   * @returns
   */
  'close': (ce: CodeEngine) => HookResult

  // 插件
  /**
   * 代码引擎模块安装之前
   * @returns
   */
  'modules:before': () => HookResult
  /**
   * 代码引擎模块安装之后
   * @returns
   */
  'modules:done': () => HookResult

  // 虚拟文件系统
  /**
   * 代码引擎 VFS 准备
   * @param ce 代码引擎实例
   * @returns
   */
  'vfs:prepare': (ce: CodeEngine) => HookResult
  /**
   * 代码引擎应用 VFS 生成之后
   * @param ce 代码引擎实例
   * @returns
   */
  'vfs:generated': (ce: CodeEngine) => HookResult
  // /**
  //  * 代码引擎写入类型声明文件
  //  * @param ce 代码引擎实例
  //  * @returns
  //  */
  // 'prepare:types': (ce: CodeEngine) => HookResult

  // layer 相关
  /**
   * layer 扩展
   * @param ce 代码引擎实例
   * @returns
   */
  'layer:extend': (ce: CodeEngine) => HookResult
  /**
   * layer 加载完成
   * @param ce 代码引擎实例
   * @returns
   */
  'layer:loaded': (layerMap: Record<ScanTypeEnum, CodeEngineLayer[]>, ce: CodeEngine) => HookResult

  // 连接构建引擎
  /**
   * 代码引擎应用写入 vite 配置文件
   * @param ce 代码引擎实例
   * @returns
   */
  'vite:config': (ce: CodeEngine) => HookResult
  /**
   * 代码引擎应用写入 rspack 配置文件
   * @param ce 代码引擎实例
   * @returns
   */
  'rspack:config': (ce: CodeEngine) => HookResult

  // 配置文件扩展
  // Schema
  /**
   * 允许扩展默认配置。
   * @param schemas 要扩展的配置
   * @returns void
   */
  'schema:extend': (schemas: SchemaDefinition[]) => void
  /**
   * 允许扩展已解析的配置。
   * @param schema 配置对象
   * @returns void
   */
  'schema:resolved': (schema: Schema) => void
  /**
   * 在写入给定配置之前调用。
   * @param schema 配置对象
   * @returns void
   */
  'schema:beforeWrite': (schema: Schema) => void
  /**
   * 在配置写入后调用。
   * @returns void
   */
  'schema:written': () => void
}

/**
 * 代码引擎内部钩子名称
 */
export type CodeEngineInternalHookName = keyof CodeEngineHooks
