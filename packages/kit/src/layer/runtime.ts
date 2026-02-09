import type {
  LayerConfig,
  LayerDef,
  LayerRegistry,
  OVFS,
  OVFSChangeReason,
  OVFSMutation,
  ResourceScanConfig,
  ResourceType,
} from '@vona-js/schema'
import type { Layer, LayerMutation } from './layer'
import { LayerStandardResourceConfig as StandardResourceConfig } from '@vona-js/schema'
import { createOVFS } from '../ovfs/ovfs'
import { createLayer } from './layer'

export interface LayerRuntimeStats {
  layerCount: number
  rawAssetCount: number
  resolvedAssetCount: number
  staticLayers: number
  dynamicLayers: number
}

export type LayerRuntimeStatus = 'idle' | 'running' | 'stopped'

export interface LayerRuntimeState {
  status: LayerRuntimeStatus
  ovfs: OVFS
  layers: Layer[]
  layerDefs: LayerDef[]
  stats: LayerRuntimeStats
}

export interface LayerRuntimeOptions {
  ovfs?: OVFS
  hydrateChunkSize?: number
  microBatchDelayMs?: number
}

export interface LayerRuntimeStartOptions {
  registry: LayerRegistry
}

export interface LayerRuntime {
  start: (config: LayerConfig, options: LayerRuntimeStartOptions) => Promise<void>
  stop: () => Promise<void>
  state: () => LayerRuntimeState
}

const EMPTY_STATS: LayerRuntimeStats = {
  layerCount: 0,
  rawAssetCount: 0,
  resolvedAssetCount: 0,
  staticLayers: 0,
  dynamicLayers: 0,
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

function toResourceConfig(
  config: Partial<Record<ResourceType, ResourceScanConfig>> | undefined,
): Record<string, ResourceScanConfig> {
  const normalized: Record<string, ResourceScanConfig> = {}
  for (const [type, scanConfig] of Object.entries(config ?? {})) {
    if (!scanConfig) {
      continue
    }
    normalized[type] = {
      enabled: scanConfig.enabled,
      name: scanConfig.name,
      pattern: [...scanConfig.pattern],
      ignore: scanConfig.ignore ? [...scanConfig.ignore] : undefined,
    }
  }
  return normalized
}

function resolveLayerResourceConfig(
  def: LayerDef,
  userResourceConfig: Record<string, ResourceScanConfig>,
  standardResourceConfig: Record<string, ResourceScanConfig>,
): Record<string, ResourceScanConfig> {
  if (def.meta?.__scanPolicy === 'user') {
    return userResourceConfig
  }
  return standardResourceConfig
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
  const normalized: OVFSMutation[] = []
  for (let i = 0; i < mutations.length; i++) {
    const m = mutations[i]
    if (m.op === 'upsert') {
      normalized.push({ op: 'upsert', asset: m.asset })
    }
    else {
      normalized.push({ op: 'removeById', id: m.id })
    }
  }

  return {
    mutations: normalized,
    reason: toReason(mutations[0]?.reason),
  }
}

const STANDARD_RESOURCE_CONFIG_NORMALIZED = toResourceConfig(StandardResourceConfig)
const DEFAULT_HYDRATE_CHUNK_SIZE = 5000
const DEFAULT_FLUSH_DELAY_MS = 10

export function createLayerRuntime(options: LayerRuntimeOptions = {}): LayerRuntime {
  const { ovfs: providedOVFS } = options
  const ovfs = providedOVFS ?? createOVFS()
  const HYDRATE_CHUNK_SIZE = options.hydrateChunkSize ?? DEFAULT_HYDRATE_CHUNK_SIZE
  const FLUSH_DELAY_MS = options.microBatchDelayMs ?? DEFAULT_FLUSH_DELAY_MS

  let status: LayerRuntimeStatus = 'idle'
  let layers: Layer[] = []
  let layerDefs: LayerDef[] = []
  let stats: LayerRuntimeStats = { ...EMPTY_STATS }
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let pendingMutations: OVFSMutation[] = []
  let pendingReason: OVFSChangeReason | undefined

  const scheduleFlush = (): void => {
    if (FLUSH_DELAY_MS <= 0) {
      queueMicrotask(() => {
        if (pendingMutations.length > 0) {
          ovfs.mutate(pendingMutations, { reason: pendingReason ?? 'manual' })
        }
        pendingMutations = []
        pendingReason = undefined
        flushTimer = null
      })
      return
    }
    if (flushTimer) {
      return
    }
    flushTimer = setTimeout(() => {
      if (pendingMutations.length > 0) {
        ovfs.mutate(pendingMutations, { reason: pendingReason ?? 'manual' })
      }
      pendingMutations = []
      pendingReason = undefined
      flushTimer = null
    }, FLUSH_DELAY_MS)
  }

  const enqueueMutations = (layerMutations: LayerMutation[]): void => {
    const normalized = normalizeMutations(layerMutations)
    pendingMutations.push(...normalized.mutations)
    if (!pendingReason) {
      pendingReason = normalized.reason
    }
    else if (pendingReason !== normalized.reason) {
      pendingReason = 'change'
    }
    scheduleFlush()
  }

  const stop = async (): Promise<void> => {
    if (layers.length > 0) {
      for (const layer of layers) {
        layer.stop()
      }
    }

    layers = []
    layerDefs = []
    stats = { ...EMPTY_STATS }
    ovfs.clear()
    status = 'stopped'
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pendingMutations = []
    pendingReason = undefined
  }

  const start = async (config: LayerConfig, options: LayerRuntimeStartOptions): Promise<void> => {
    if (status === 'running') {
      throw new Error('LayerRuntime already running')
    }

    assertValidResourceConfig(config)
    const userResourceConfig = toResourceConfig(config.config)

    try {
      const orderedDefs = options.registry.getOrdered()
      layerDefs = [...orderedDefs]

      let staticCount = 0
      let dynamicCount = 0

      const newLayers: Layer[] = []
      for (const def of orderedDefs) {
        const effectiveResourceConfig = resolveLayerResourceConfig(def, userResourceConfig, STANDARD_RESOURCE_CONFIG_NORMALIZED)
        const layer = createLayer({ def, config: effectiveResourceConfig })
        newLayers.push(layer)
        if (layer.type === 'static') {
          staticCount++
        }
        else {
          dynamicCount++
        }
      }
      await Promise.all(newLayers.map(layer => layer.start()))
      layers = newLayers

      let rawAssetCount = 0
      let buffer: OVFSMutation[] = []
      for (const layer of layers) {
        const assets = layer.getAssets()
        rawAssetCount += assets.length
        for (let i = 0; i < assets.length; i++) {
          buffer.push({ op: 'upsert', asset: assets[i] })
          if (buffer.length >= HYDRATE_CHUNK_SIZE) {
            ovfs.mutate(buffer, { silent: true, reason: 'hydrate' })
            buffer = []
          }
        }
      }
      if (buffer.length > 0) {
        ovfs.mutate(buffer, { silent: true, reason: 'hydrate' })
      }

      for (const layer of layers) {
        if (layer.type !== 'dynamic') {
          continue
        }

        layer.onMutation((layerMutations) => {
          if (layerMutations.length === 0) {
            return
          }
          enqueueMutations(layerMutations)
        })
      }

      stats = {
        layerCount: orderedDefs.length,
        rawAssetCount,
        resolvedAssetCount: ovfs.stats().totalResources,
        staticLayers: staticCount,
        dynamicLayers: dynamicCount,
      }

      status = 'running'
    }
    catch (error) {
      await stop()
      throw error
    }
  }

  return {
    start,
    stop,
    state: () => {
      return {
        status,
        ovfs,
        layers: [...layers],
        layerDefs: [...layerDefs],
        stats: { ...stats },
      }
    },
  }
}
