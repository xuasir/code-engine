import type { Vona } from '@vona-js/schema'
import { defineModule, useLogger } from '@vona-js/kit'
import { createPipeline } from '@vona-js/kit/internal'

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
    const pipeline = createPipeline({
      rootDir: vona.options.__rootDir,
      ovfs: vona.ovfs,
    })

    const runLayerPipeline = async (): Promise<void> => {
      if (initialized) {
        return
      }
      initialized = true

      const layerConfig = vona.options.layer
      if (!layerConfig) {
        logger.debug('layer config missing')
        return
      }

      stopOVFSListener = vona.ovfs.subscribe((changes) => {
        if (changes.length === 0) {
          return
        }
        void vona.callHook('ovfs:change', changes, vona)
      })

      await pipeline.start(layerConfig, {
        onExtend: ctx => vona.callHook('layer:extend', ctx),
      })
      void vona.callHook('ovfs:change', [], vona)

      const manifest = vona.ovfs.toManifest()
      await vona.callHook('layer:loaded', manifest.resources, vona)
    }

    // layer 扩展和扫描需在 modules:done 之后执行，以便其他模块先完成装配
    vona.hook('modules:done', async () => {
      await runLayerPipeline()
    })

    vona.hook('close', async () => {
      stopOVFSListener?.()
      stopOVFSListener = undefined
      await pipeline.stop()
    })
  },
})
