import type { LayerOptions } from '@a-sir/code-engine-schema'
import path from 'node:path'
import { addLayer, defineModule, getLayerKey, notify, useLogger } from '@a-sir/code-engine-kit'
import { ScanPriorityEnum } from '@a-sir/code-engine-schema'
import { loadLayers } from './loader'
import { watchLayers } from './watcher'

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
        cwd: path.resolve(ce.options.__rootDir, resolvedOptions.name),
        priority: ScanPriorityEnum.User,
        ignore: [],
      })
    }

    ce.hook('vfs:prepare', async () => {
      // 采集 layer
      await ce.callHook('layer:extend', ce)
      // 读取 layer
      const layers = ce.options.__layers
      logger.debug('layer', layers)
      // 初次执行
      const layerMap = await loadLayers(layers, resolvedOptions)

      // 监听变化，并且注册layer更新相关的钩子
      // 仅在开发模式下启用
      if (ce.env.dev) {
        const watcher = watchLayers(layers, resolvedOptions, async (type, data) => {
          logger.info(`Layer update detected: ${type}`)
          // 更新 layerMap
          layerMap[type] = data
          // 通知更新
          notify(getLayerKey(type))
          // 触发钩子
          await ce.callHook('layer:change', type, data, ce)
        })

        // 注册销毁钩子
        ce.hook('close', () => watcher.close())
      }
      // 分析layer
      await ce.callHook('layer:loaded', layerMap, ce)
    })
  },
})
