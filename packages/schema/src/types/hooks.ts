import type { Schema, SchemaDefinition } from 'untyped'
import type { LayerAsset } from './asset'
import type { Vona } from './engine'
import type { ResourceType } from './layer'
import type { OVFSResourceChange } from './ovfs'

export type HookResult = Promise<void> | void

export interface VonaHooks {
  /**
   * 代码引擎准备就绪
   */
  'ready': (vona: Vona) => HookResult
  /**
   * 代码引擎关闭
   */
  'close': (vona: Vona) => HookResult

  /**
   * 代码引擎模块安装之前
   */
  'modules:before': () => HookResult
  /**
   * 代码引擎模块安装之后
   */
  'modules:done': () => HookResult

  /**
   * layer 加载完成
   */
  'layer:loaded': (layerMap: Record<ResourceType, LayerAsset[]>, vona: Vona) => HookResult
  /**
   * ovfs 变更
   */
  'ovfs:change': (changes: OVFSResourceChange[], vona: Vona) => HookResult

  /**
   * 代码引擎应用写入 vite 配置文件
   */
  'vite:config': (vona: Vona) => HookResult
  /**
   * 代码引擎应用写入 rspack 配置文件
   */
  'rspack:config': (vona: Vona) => HookResult

  /**
   * 允许扩展默认配置。
   */
  'schema:extend': (schemas: SchemaDefinition[]) => void
  /**
   * 允许扩展已解析的配置。
   */
  'schema:resolved': (schema: Schema) => void
  /**
   * 在写入给定配置之前调用。
   */
  'schema:beforeWrite': (schema: Schema) => void
  /**
   * 在配置写入后调用。
   */
  'schema:written': () => void
}

/**
 * 代码引擎内部钩子名称
 */
export type VonaInternalHookName = keyof VonaHooks
