import type { LayerOptions } from '@vona-js/schema'
import path from 'node:path'
import { addLayer, defineModule, useLogger } from '@vona-js/kit'
import { ScanPriorityEnum } from '@vona-js/schema'
import { mountLayerFiles, syncVfsToLayerMap } from './loader'
import { watchLayers } from './watcher'

export default defineModule<LayerOptions>({
  meta: {
    name: 'layer',
    version: '1.0.0',
    configKey: 'layer',
  },
  setup(resolvedOptions, ce) {
    const logger = useLogger('vona:layer')

    // 添加 user layer
    if (resolvedOptions.enabled) {
      addLayer({
        cwd: path.resolve(ce.options.__rootDir, resolvedOptions.name),
        priority: ScanPriorityEnum.User,
        ignore: [],
      })
    }

    ce.hook('vfs:prepare', async () => {
      // 采集 layer
      await ce.callHook('layer:extend', ce)
      // 读取 layer (注意: 这里是 LayerDefinition，还不是完整的 Layer 对象)
      const layers = ce.options.__layers
      logger.debug('layer', layers)

      // 将 Layer 挂载到 VFS
      await ce.vfs.use(async () => {
        // 1. 初始加载：挂载所有文件到 VFS
        await mountLayerFiles(ce, layers, resolvedOptions)

        // 2. 根据 VFS 状态生成 LayerMap
        await syncVfsToLayerMap(ce, resolvedOptions)
      })

      // 监听变化，并且注册layer更新相关的钩子
      // 仅在开发模式下启用
      if (ce.env.dev) {
        const _watcher = watchLayers(ce, layers, resolvedOptions)
        // TODO: handle watcher cleanup if necessary
      }

      // 分析layer
      // await ce.callHook('layer:loaded', layerMap, ce)
    })
  },
})
