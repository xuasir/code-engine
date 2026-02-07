import type { LayerConfig, LayerDef, ResourceScanConfig } from '@vona-js/schema'
import type { OVFS } from '../ovfs/ovfs'
import type { Layer, LayerChange } from './layer'
import type { LayerRegistry } from './registry'
import { existsSync } from 'node:fs'
import { PRIORITY } from '@vona-js/schema'
import { isAbsolute, join, normalize, resolve } from 'pathe'
import { createOVFS } from '../ovfs/ovfs'
import { createLayer } from './layer'
import { createLayerRegistry } from './registry'

export interface PipelineResult {
  registry: LayerRegistry
  ovfs: OVFS
  layers: Layer[]
  stats: PipelineStats
}

export interface PipelineStats {
  layerCount: number
  rawAssetCount: number
  resolvedAssetCount: number
  staticLayers: number
  dynamicLayers: number
}

export interface PipelineOptions {
  rootDir: string
  ovfs?: OVFS
}

function getUserSrcLayer(root: string): LayerDef | null {
  const srcPath = join(root, 'src')
  if (!existsSync(srcPath)) {
    return null
  }
  return {
    id: 'user',
    source: {
      type: 'local',
      root: srcPath,
      dynamic: true,
    },
    priority: PRIORITY.USER,
  }
}

function resolveLayerDefRoot(rootDir: string, def: LayerDef): LayerDef {
  if (def.source.type !== 'local') {
    return def
  }

  const absoluteRoot = isAbsolute(def.source.root)
    ? normalize(def.source.root)
    : resolve(rootDir, def.source.root)

  return {
    ...def,
    source: {
      ...def.source,
      root: absoluteRoot,
    },
  }
}

function assertValidLayerDefs(layerDefs: LayerDef[]): void {
  const idSet = new Set<string>()
  for (const def of layerDefs) {
    if (idSet.has(def.id)) {
      throw new Error(`Duplicate layer id found: ${def.id}`)
    }
    idSet.add(def.id)
  }
}

function assertValidResourceConfig(config: LayerConfig): void {
  for (const [type, item] of Object.entries(config.config ?? {})) {
    if (!item) {
      continue
    }
    if (!item.name || item.name.trim().length === 0) {
      throw new Error(`Resource config "${type}" must define a non-empty name`)
    }
    if (item.name.startsWith('/') || item.name.includes('..')) {
      throw new Error(`Resource config "${type}" has invalid name: ${item.name}`)
    }
  }
}

function toRemoteCachePath(rootDir: string, cacheDir: string, remoteRoot: string): string {
  const safeName = remoteRoot.replace(/^@/, '').replace(/[\\/]/g, '__')
  return join(rootDir, cacheDir, safeName)
}

function materializeRemoteLayer(rootDir: string, config: LayerConfig, def: LayerDef): LayerDef | null {
  if (def.source.type !== 'remote') {
    return def
  }

  const cacheDir = config.remote?.cacheDir ?? '.vona/layers'
  const preferCache = config.remote?.preferCache !== false
  const cachedRoot = toRemoteCachePath(rootDir, cacheDir, def.source.root)

  if (preferCache && existsSync(cachedRoot)) {
    return {
      ...def,
      source: {
        type: 'local',
        root: cachedRoot,
        dynamic: false,
      },
    }
  }

  console.warn(`[vona:layer] remote layer "${def.id}" cache not found, skipped: ${cachedRoot}`)
  return null
}

export function createPipeline(options: PipelineOptions) {
  const { rootDir, ovfs: providedOVFS } = options

  return {
    async run(config: LayerConfig): Promise<PipelineResult> {
      const registry = createLayerRegistry()
      const ovfs = providedOVFS ?? createOVFS()
      const layers: Layer[] = []
      const resourceConfig: Record<string, ResourceScanConfig> = {}
      for (const [type, scanConfig] of Object.entries(config.config ?? {})) {
        if (scanConfig) {
          resourceConfig[type] = scanConfig
        }
      }

      assertValidResourceConfig(config)

      const sourceDefs = [...(config.defs ?? [])].map(def => resolveLayerDefRoot(rootDir, def))
      const userSrcLayer = getUserSrcLayer(rootDir)
      if (userSrcLayer) {
        sourceDefs.unshift(resolveLayerDefRoot(rootDir, userSrcLayer))
      }

      assertValidLayerDefs(sourceDefs)

      const preparedDefs = sourceDefs.map((def, index) => ({
        ...def,
        meta: {
          ...(def.meta ?? {}),
          __order: index,
        },
      }))

      const materializedDefs = preparedDefs
        .map(def => materializeRemoteLayer(rootDir, config, def))
        .filter(Boolean) as LayerDef[]

      for (const def of materializedDefs) {
        registry.register(def)
      }

      const orderedDefs = registry.getOrdered()

      let staticCount = 0
      let dynamicCount = 0

      for (const def of orderedDefs) {
        const layer = createLayer({
          def,
          config: resourceConfig,
          ovfs,
        })

        await layer.start()
        layers.push(layer)

        if (layer.type === 'static') {
          staticCount++
        }
        else {
          dynamicCount++
        }
      }

      const allAssets = layers.flatMap(layer => layer.getAssets())
      ovfs.addMany(allAssets)
      const resolvedAssetCount = ovfs.allTypes().reduce((sum, type) => sum + ovfs.getByType(type).length, 0)

      const stats: PipelineStats = {
        layerCount: orderedDefs.length,
        rawAssetCount: allAssets.length,
        resolvedAssetCount,
        staticLayers: staticCount,
        dynamicLayers: dynamicCount,
      }

      return {
        registry,
        ovfs,
        layers,
        stats,
      }
    },

    formatOutput(result: PipelineResult): object {
      const { registry, ovfs, layers, stats } = result

      const resourcesByType: Record<string, number> = {}
      for (const type of ovfs.allTypes()) {
        resourcesByType[type] = ovfs.getByType(type).length
      }

      return {
        status: 'init',
        layers: registry.getOrdered().map(l => ({
          id: l.id,
          priority: l.priority,
          type: layers.find(lay => lay.def.id === l.id)?.type,
        })),
        resources: resourcesByType,
        stats,
        tree: this.buildResourceTree(result),
      }
    },

    buildResourceTree(result: PipelineResult): object {
      const tree: Record<string, any> = {}

      for (const type of result.ovfs.allTypes()) {
        const assets = result.ovfs.getByType(type)
        for (const asset of assets) {
          const parts = asset.key.split('/').filter(Boolean)
          this.insertToTree(tree, parts, {
            id: asset.id,
            type: asset.type,
            layer: asset.meta.layerId,
            priority: asset.meta.priority,
            route: asset.route?.path,
          })
        }
      }

      return tree
    },

    insertToTree(tree: any, parts: string[], value: any): void {
      let current = tree
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        if (!current[part]) {
          current[part] = {}
        }
        current = current[part]
      }
      current[parts[parts.length - 1]] = value
    },

    formatChangeOutput(layer: Layer, changes: LayerChange[]): object {
      const added: string[] = []
      const updated: string[] = []
      const removed: string[] = []

      for (const change of changes) {
        switch (change.type) {
          case 'add':
            added.push(change.key)
            break
          case 'change':
            updated.push(change.key)
            break
          case 'unlink':
            removed.push(change.key)
            break
        }
      }

      return {
        status: 'change',
        layer: layer.def.id,
        event: changes.length === 1 ? changes[0].type : 'batch',
        diff: {
          added: [...new Set(added)],
          updated: [...new Set(updated)],
          removed: [...new Set(removed)],
        },
      }
    },
  }
}
