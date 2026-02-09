import type { Vona } from '@vona-js/schema'
import { addLayer, defineModule, useLogger } from '@vona-js/kit'
import { closeLayerRegistration, createLayerRuntime, createUserSrcLayer } from '@vona-js/kit/internal'

const BASE_LAYER_ORDER_START = -1_000_000_000

function withUserLayerMeta<T extends { meta?: Record<string, unknown> }>(def: T, order: number): T {
  return {
    ...def,
    meta: {
      ...(def.meta ?? {}),
      __order: order,
      __origin: 'user',
      __scanPolicy: 'user',
    },
  }
}

export const LayerModule = defineModule({
  meta: {
    name: 'vona:layer',
    version: '0.0.1',
    configKey: 'layer',
  },
  async setup(_options, vona: Vona) {
    const logger = useLogger('vona:layer')
    let initialized = false
    let stopOVFSListener: (() => void) | undefined
    const runtime = createLayerRuntime({
      ovfs: vona.ovfs,
    })
    const layerConfig = vona.options.layer

    if (!layerConfig) {
      logger.debug('layer config missing')
      return
    }

    // 注册用户层
    if (layerConfig.enabled) {
      const userLayer = createUserSrcLayer(vona.options.__rootDir)
      if (userLayer) {
        addLayer(withUserLayerMeta(userLayer, BASE_LAYER_ORDER_START))
      }
    }

    // 注册用户定义层
    for (const [index, def] of (layerConfig.defs ?? []).entries()) {
      addLayer(withUserLayerMeta(def, BASE_LAYER_ORDER_START + index + 1))
    }

    const runLayerRuntime = async (): Promise<void> => {
      if (initialized) {
        return
      }
      initialized = true

      closeLayerRegistration(vona)

      stopOVFSListener = vona.ovfs.subscribe((changes) => {
        if (changes.length === 0) {
          return
        }
        void vona.callHook('ovfs:change', changes, vona)
      })

      vona.options.__layers = vona.layerRegistry.getOrdered()
      await runtime.start(layerConfig, {
        registry: vona.layerRegistry,
      })
      void vona.callHook('ovfs:change', [], vona)

      const manifest = vona.ovfs.toManifest()
      await vona.callHook('layer:loaded', manifest.resources, vona)
    }

    // 在 modules:done 之后再启动 runtime，以确保 layer 注册阶段已结束
    vona.hook('modules:done', async () => {
      await runLayerRuntime()
    })

    vona.hook('close', async () => {
      stopOVFSListener?.()
      stopOVFSListener = undefined
      await runtime.stop()
    })
  },
})
