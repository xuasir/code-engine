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
   * @default 'app'
   */
  name: string
  /**
   * API 目录
   * @default { name: 'api' }
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
}

// 层定义
export interface VonaLayerDefinition {
  /** 层工作目录 */
  cwd: string
  /** 层优先级 @default 0 */
  priority?: number
  /** 忽略文件 */
  ignore?: string[]
}

// 扫描后的层数据
export interface VonaLayer {
  /** 元数据 */
  meta: {
    /** Layer 名称 (e.g. "base") */
    layer: string
    /** Layer 优先级 */
    priority: number
  }

  /** 路径信息 */
  path: {
    /** Layer 根目录绝对路径 */
    root: string
    /** 模块完整地址 */
    abs: string
    /** 相对于 Root 的路径 (e.g. "components/Button.vue") */
    relative: string
    /** 相对扫描文件夹的地址 (e.g. "Button.vue") */
    scan: string
    /** 别名地址，相对于根目录 @cwd/xxx */
    alias: string
    /** vite 模式下 prefetch 地址 */
    prefetch: string
  }

  /** 命名变体 */
  name: {
    /** 原始文件名 */
    origin: string
    /** 大驼峰 */
    pascal: string
    /** 懒加载大驼峰 */
    lazyPascal: string
    /** 中划线 */
    kebab: string
    /** 懒加载中划线 */
    lazyKebab: string
    /** 安全的变量名 */
    safeVar: string
    /** 安全的异步变量名 */
    safeLazyVar: string
    /** 独立包名 */
    chunk: string
  }

  /** 配置与加载 */
  config: {
    /** 导出 仅支持默认导出 */
    export: 'default'
    /** 预请求 */
    prefetch: boolean
    /** 预加载 */
    preload: boolean
  }

  /** 运行时加载器 */
  loader: {
    /** 动态加载语句 */
    dynamicImport: () => string
  }

  /** 扩展字段 */
  [key: string]: any

  /** 覆盖历史：记录被当前层覆盖的下层资源 */
  overrides?: Partial<VonaLayer>[]
}
