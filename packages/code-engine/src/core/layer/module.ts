import type { LayerOptions } from '@a-sir/code-engine-schema'
import path from 'node:path'
import { addLayer, defineModule, useLogger } from '@a-sir/code-engine-kit'
import { ScanPriorityEnum } from '@a-sir/code-engine-schema'
import { loadLayers } from './loader'

export default defineModule<LayerOptions>({
  meta: {
    name: 'layer',
    version: '1.0.0',
    configKey: 'layer',
  },
  setup(resolvedOptions, ce) {
    const logger = useLogger('codeEngine:layer')

    // 添加 user layer
    if (resolvedOptions.enabled) {
      addLayer({
        cwd: path.resolve(ce.options.rootDir, resolvedOptions.name),
        priority: ScanPriorityEnum.User,
        ignore: [],
      })
    }

    ce.hook('vfs:prepare', async () => {
      // 采集 layer
      await ce.callHook('layer:extend', ce)
      // 读取 layer
      const layers = ce.options._layers
      logger.debug('layer', layers)
      const layerMap = await loadLayers(layers, resolvedOptions)
      // 分析layer
      await ce.callHook('layer:loaded', layerMap, ce)
    })
  },
})
