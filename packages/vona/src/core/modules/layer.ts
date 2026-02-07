import type { LayerAsset, ResourceManifest, ResourceType, Vona } from '@vona-js/schema'
import { createPipeline, defineModule, useLogger } from '@vona-js/kit'

export const LayerModule = defineModule({
  meta: {
    name: 'vona:layer',
    version: '0.0.1',
    configKey: 'layer',
  },
  async setup(_options, vona: Vona) {
    const logger = useLogger('vona:layer')
    const layerConfig = vona.options.layer

    if (!layerConfig?.enabled) {
      logger.debug('layer disabled')
      return
    }

    await vona.callHook('layer:extend', vona)

    const pipeline = createPipeline({
      rootDir: vona.options.__rootDir,
    })
    const result = await pipeline.run(layerConfig)

    const output = pipeline.formatOutput(result)
    logger.info(JSON.stringify(output, null, 2))

    vona.ovfs = result.ovfs

    const syncManifest = (): ResourceManifest => result.ovfs.toManifest()

    const manifest = syncManifest()
    await vona.callHook('layer:loaded', manifest.resources, vona)

    for (const layer of result.layers) {
      if (layer.type !== 'dynamic') {
        continue
      }

      layer.onChange((assets, changes) => {
        const changeOutput = pipeline.formatChangeOutput(layer, changes)
        logger.info(JSON.stringify(changeOutput, null, 2))

        syncManifest()

        const grouped = new Map<ResourceType, LayerAsset[]>()
        for (const change of changes) {
          const resourceType = resolveResourceType(change.key, change.asset)
          if (!resourceType) {
            continue
          }
          if (!grouped.has(resourceType)) {
            grouped.set(resourceType, [])
          }
          if (change.asset) {
            grouped.get(resourceType)!.push(change.asset)
          }
        }
        for (const [resourceType, changedAssets] of grouped.entries()) {
          void vona.callHook('layer:change', resourceType, changedAssets, vona)
        }
      })
    }
  },
})

function resolveResourceType(key: string, asset?: LayerAsset): ResourceType | null {
  if (asset) {
    return asset.type
  }
  const segment = key.split('/').filter(Boolean)[0]
  const knownTypes: ResourceType[] = [
    'layouts',
    'components',
    'pages',
    'composables',
    'apis',
    'icons',
    'store',
    'utils',
    'styles',
    'plugins',
  ]
  return knownTypes.includes(segment as ResourceType) ? segment as ResourceType : null
}
