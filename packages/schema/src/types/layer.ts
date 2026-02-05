// 扫描模块类型枚举
export enum ScanTypeEnum {
  Layout = 'layouts',
  Component = 'components',
  Composable = 'composables',
  Store = 'store',
  Page = 'pages',
  Api = 'api',
  Icon = 'icons',
  Util = 'utils',
  Style = 'styles',
  Plugin = 'plugins',
}

// 扫描模块优先级枚举
export enum ScanPriorityEnum {
  Base = 0,
  User = -9999999,
}

// 扫描配置
export interface ScanConfig<T extends ScanTypeEnum = ScanTypeEnum> {
  /** 扫描模块类型 */
  type: T
  /** 扫描模块工作目录 */
  name: string
  /** 扫描匹配 Patterns */
  pattern?: string | string[]
  /** 忽略 Patterns */
  ignore?: string[]
  /**
   * 这些属性（prefetch/preload）在生产环境中用于配置 webpack 如何通过其魔法注释处理带有 Lazy 前缀的组件。
   * 更多信息请参阅 webpack 文档：https://webpack.js.org/api/module-methods/#magic-comments
   */
  prefetch?: boolean
  /**
   * 这些属性（prefetch/preload）在生产环境中用于配置 webpack 如何通过其魔法注释处理带有 Lazy 前缀的组件。
   * 更多信息请参阅 webpack 文档：https://webpack.js.org/api/module-methods/#magic-comments
   */
  preload?: boolean
}

// 层下的全局扫描配置
export type LayerOptionScanConfig = Omit<ScanConfig, 'type'> & { enabled: boolean }

// 层配置
export interface LayerOptions {
  /**
   * 启用状态
   * 默认开启用户最佳实践目录层扫描
   * @default true
   */
  enabled: boolean
  /**
   * 层名称
   * @default 'src'
   */
  name: string
  /**
   * 远程层配置
   */
  remote?: {
    /**
     * 远程层缓存目录
     * @default '.vona/layers'
     */
    cacheDir?: string
    /**
     * 缓存优先
     * @default true
     */
    preferCache?: boolean
  }
  /**
   * API 目录
   * @default { name: 'apis' }
   */
  api: LayerOptionScanConfig
  /**
   * 组件目录
   * @default { name: 'components' }
   */
  components: LayerOptionScanConfig
  /**
   * 组合函数目录
   * @default { name: 'composables' }
   */
  composables: LayerOptionScanConfig
  /**
   * 布局目录
   * @default { name: 'layouts' }
   */
  layouts: LayerOptionScanConfig
  /**
   * 页面目录
   * @default { name: 'pages' }
   */
  pages: LayerOptionScanConfig
  /**
   * 状态管理目录
   * @default { name: 'store' }
   */
  store: LayerOptionScanConfig
  /**
   * 工具目录
   * @default { name: 'utils' }
   */
  utils: LayerOptionScanConfig
  /**
   * 图标目录
   * @default { name: 'icons' }
   */
  icons: LayerOptionScanConfig
  /**
   * 样式目录
   * @default { name: 'styles' }
   */
  styles: LayerOptionScanConfig
  /**
   * 插件目录
   * @default { name: 'plugins' }
   */
  plugins: LayerOptionScanConfig
}

export type LayerSourceLocal = string

export interface LayerSourceRemote {
  source: {
    url?: string
    pkg?: string
    integrity?: string
    root: string
  }
  cacheDir: string
  preferCache?: boolean
}

export type LayerSource = LayerSourceLocal | LayerSourceRemote

// 层定义
export interface LayerDefinition {
  /** Layer 唯一标识 */
  id: string
  /** Layer 来源 */
  source: LayerSource
  /** 层优先级 */
  priority: number
  /** 忽略文件 */
  ignore?: string[]
}

export interface LayerAssetMeta {
  layer: string
  priority: number
}

export interface LayerAssetPath {
  root: string
  abs: string
  relative: string
  scan: string
  alias: string
  prefetch: string
}

export interface LayerAssetName {
  origin: string
  pascal: string
  lazyPascal: string
  kebab: string
  lazyKebab: string
  safeVar: string
  safeLazyVar: string
  chunk: string
}

export interface LayerAssetConfig {
  export: 'default'
  prefetch?: boolean
  preload?: boolean
}

export interface LayerAssetLoader {
  dynamicImport: () => string
}

export interface LayerAsset {
  type: ScanTypeEnum
  id: string
  virtualPath: string
  meta: LayerAssetMeta
  path: LayerAssetPath
  name?: LayerAssetName
  config: LayerAssetConfig
  loader: LayerAssetLoader
  overrides?: Partial<LayerAsset>[]
}
