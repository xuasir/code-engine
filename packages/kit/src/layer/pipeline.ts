import type {
  LayerConfig,
  LayerDef,
  OVFS,
  OVFSChangeReason,
  OVFSMutation,
  ResourceScanConfig,
} from '@vona-js/schema'
import type { Layer, LayerMutation } from './layer'
import type { LayerRegistry } from './registry'
import { existsSync } from 'node:fs'
import { PRIORITY } from '@vona-js/schema'
import { isAbsolute, join, normalize, resolve } from 'pathe'
import { createOVFS } from '../ovfs/ovfs'
import { createLayer } from './layer'
import { createLayerRegistry } from './registry'

export interface PipelineStats {
  layerCount: number
  rawAssetCount: number
  resolvedAssetCount: number
  staticLayers: number
  dynamicLayers: number
}

export type PipelineStatus = 'idle' | 'running' | 'stopped'

export interface PipelineState {
  status: PipelineStatus
  registry: LayerRegistry
  ovfs: OVFS
  layers: Layer[]
  stats: PipelineStats
}

export interface PipelineOptions {
  rootDir: string
  ovfs?: OVFS
}

export interface Pipeline {
  start: (config: LayerConfig) => Promise<void>
  stop: () => Promise<void>
  state: () => PipelineState
}

const EMPTY_STATS: PipelineStats = {
  layerCount: 0,
  rawAssetCount: 0,
  resolvedAssetCount: 0,
  staticLayers: 0,
  dynamicLayers: 0,
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

function toReason(reason: LayerMutation['reason'] | undefined): OVFSChangeReason {
  switch (reason) {
    case 'add':
      return 'add'
    case 'change':
      return 'change'
    case 'unlink':
      return 'unlink'
    default:
      return 'manual'
  }
}

function normalizeMutations(mutations: LayerMutation[]): {
  mutations: OVFSMutation[]
  reason: OVFSChangeReason
} {
  const normalized: OVFSMutation[] = mutations.map((mutation) => {
    if (mutation.op === 'upsert') {
      return {
        op: 'upsert',
        asset: mutation.asset,
      }
    }
    return {
      op: 'removeById',
      id: mutation.id,
    }
  })
  return {
    mutations: normalized,
    reason: toReason(mutations[0]?.reason),
  }
}

export function createPipeline(options: PipelineOptions): Pipeline {
  const { rootDir, ovfs: providedOVFS } = options
  const ovfs = providedOVFS ?? createOVFS()
  let status: PipelineStatus = 'idle'
  let registry = createLayerRegistry()
  let layers: Layer[] = []
  let stats: PipelineStats = { ...EMPTY_STATS }

  const stop = async (): Promise<void> => {
    if (layers.length > 0) {
      for (const layer of layers) {
        layer.stop()
      }
    }
    layers = []
    registry = createLayerRegistry()
    stats = { ...EMPTY_STATS }
    ovfs.clear()
    status = 'stopped'
  }

  const start = async (config: LayerConfig): Promise<void> => {
    if (status === 'running') {
      throw new Error('Pipeline already running')
    }

    await stop()

    const resourceConfig: Record<string, ResourceScanConfig> = {}
    for (const [type, scanConfig] of Object.entries(config.config ?? {})) {
      if (scanConfig) {
        resourceConfig[type] = scanConfig
      }
    }

    assertValidResourceConfig(config)

    const sourceDefs = [...(config.defs ?? [])].map(def => resolveLayerDefRoot(rootDir, def))
    if (config.enabled) {
      const userSrcLayer = getUserSrcLayer(rootDir)
      if (userSrcLayer) {
        sourceDefs.unshift(resolveLayerDefRoot(rootDir, userSrcLayer))
      }
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
    const hydrateMutations: OVFSMutation[] = allAssets.map(asset => ({ op: 'upsert', asset }))
    ovfs.mutate(hydrateMutations, { silent: true, reason: 'hydrate' })

    for (const layer of layers) {
      if (layer.type !== 'dynamic') {
        continue
      }
      layer.onMutation((layerMutations) => {
        if (layerMutations.length === 0) {
          return
        }
        const normalized = normalizeMutations(layerMutations)
        ovfs.mutate(normalized.mutations, { reason: normalized.reason })
      })
    }

    stats = {
      layerCount: orderedDefs.length,
      rawAssetCount: allAssets.length,
      resolvedAssetCount: ovfs.stats().totalResources,
      staticLayers: staticCount,
      dynamicLayers: dynamicCount,
    }

    status = 'running'
  }

  return {
    start,
    stop,
    state: () => {
      return {
        status,
        registry,
        ovfs,
        layers: [...layers],
        stats: { ...stats },
      }
    },
  }
}
