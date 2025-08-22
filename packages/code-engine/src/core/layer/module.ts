import { defineModule, useLogger } from '@a-sir/code-engine-kit'

export interface LayerOptions {
  /** 启用状态 */
  enabled: boolean
  // 层
  name: string
  // API 目录
  api: string
  // 组件目录
  components: string
  // 组合函数目录
  composables: string
  // 布局目录
  layouts: string
  // 页面目录
  pages: string
  // 状态管理目录
  store: string
  // 工具目录
  utils: string
}

export default defineModule<LayerOptions>({
  meta: {
    name: 'layer',
    version: '1.0.0',
    configKey: 'layer',
  },
  defaults: {
    enabled: true,
    name: 'src',
    api: 'api',
    components: 'components',
    composables: 'composables',
    layouts: 'layouts',
    pages: 'pages',
    store: 'store',
    utils: 'utils',
  },
  setup(resolvedOptions, ce) {
    const logger = useLogger('codeEngine:layer')
    logger.info('layer module setup', resolvedOptions)

    ce.hook('vfs:prepare', async () => {
      // 采集 layer
      await ce.callHook('layer:extend', ce)
      // 读取 layer
      const layer = ce.options._layers
      logger.debug('layer', layer)
      // 分析layer
      await ce.callHook('layer:loaded', ce)
    })
  },
})
