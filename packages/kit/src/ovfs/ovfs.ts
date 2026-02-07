import type { LayerAsset, ResourceManifest, ResourceType } from '@vona-js/schema'

const ResourceTypeValues: ResourceType[] = [
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

export interface OVFS {
  add: (asset: LayerAsset) => void
  upsert: (asset: LayerAsset) => void
  addMany: (assets: LayerAsset[]) => void
  removeById: (id: string) => LayerAsset | undefined
  resolve: (key: string) => LayerAsset | undefined
  resolveAll: (key: string) => LayerAsset[]
  list: (type?: ResourceType) => string[]
  getById: (id: string) => LayerAsset | undefined
  glob: (pattern: string) => LayerAsset[]
  getByType: (type: ResourceType) => LayerAsset[]
  allTypes: () => ResourceType[]
  stats: () => { totalResources: number, byType: Record<ResourceType, number> }
  toManifest: () => ResourceManifest
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/\//g, '\\/')
    .replace(/\*\*/g, '§§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§§/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function toOverride(asset: LayerAsset): Partial<LayerAsset> {
  return {
    id: asset.id,
    key: asset.key,
    type: asset.type,
    meta: {
      layerId: asset.meta.layerId,
      priority: asset.meta.priority,
      layerOrder: asset.meta.layerOrder,
      scanKey: asset.meta.scanKey,
      routePath: asset.meta.routePath,
      routeScore: asset.meta.routeScore,
    },
  }
}

function compareAsset(a: LayerAsset, b: LayerAsset): number {
  if (a.meta.priority !== b.meta.priority) {
    return b.meta.priority - a.meta.priority
  }
  if (a.meta.layerOrder !== b.meta.layerOrder) {
    return a.meta.layerOrder - b.meta.layerOrder
  }
  return a.id.localeCompare(b.id)
}

export function createOVFS(): OVFS {
  const byKey = new Map<string, LayerAsset[]>()
  const byType = new Map<ResourceType, Map<string, LayerAsset>>()
  const byId = new Map<string, LayerAsset>()

  const setWinner = (asset: LayerAsset) => {
    const stack = byKey.get(asset.key) ?? []
    asset.overrides = stack.slice(1).map(toOverride)
    if (!byType.has(asset.type)) {
      byType.set(asset.type, new Map<string, LayerAsset>())
    }
    byType.get(asset.type)!.set(asset.key, asset)
  }

  const removeWinner = (type: ResourceType, key: string) => {
    byType.get(type)?.delete(key)
  }

  const syncOne = (key: string, type: ResourceType) => {
    const stack = byKey.get(key) ?? []
    if (stack.length === 0) {
      byKey.delete(key)
      removeWinner(type, key)
      return
    }

    stack.sort(compareAsset)
    byKey.set(key, stack)
    setWinner(stack[0])
  }

  const upsertAsset = (asset: LayerAsset) => {
    const previous = byId.get(asset.id)
    if (previous && previous.key !== asset.key) {
      const previousStack = (byKey.get(previous.key) ?? []).filter(item => item.id !== previous.id)
      if (previousStack.length === 0) {
        byKey.delete(previous.key)
        removeWinner(previous.type, previous.key)
      }
      else {
        byKey.set(previous.key, previousStack)
        syncOne(previous.key, previous.type)
      }
    }

    byId.set(asset.id, asset)

    const nextStack = byKey.get(asset.key) ?? []
    const index = nextStack.findIndex(item => item.id === asset.id)
    if (index >= 0) {
      nextStack[index] = asset
    }
    else {
      nextStack.push(asset)
    }
    byKey.set(asset.key, nextStack)
    syncOne(asset.key, asset.type)
  }

  return {
    add: (asset) => {
      upsertAsset(asset)
    },

    upsert: (asset) => {
      upsertAsset(asset)
    },

    addMany: (assets) => {
      for (const asset of assets) {
        byId.set(asset.id, asset)
        const stack = byKey.get(asset.key) ?? []
        const index = stack.findIndex(item => item.id === asset.id)
        if (index >= 0) {
          stack[index] = asset
        }
        else {
          stack.push(asset)
        }
        byKey.set(asset.key, stack)
      }
      for (const [key, stack] of byKey.entries()) {
        if (stack.length === 0) {
          continue
        }
        syncOne(key, stack[0].type)
      }
    },

    removeById: (id) => {
      const current = byId.get(id)
      if (!current) {
        return undefined
      }
      byId.delete(id)

      const nextStack = (byKey.get(current.key) ?? []).filter(item => item.id !== id)
      if (nextStack.length === 0) {
        byKey.delete(current.key)
        removeWinner(current.type, current.key)
      }
      else {
        byKey.set(current.key, nextStack)
        syncOne(current.key, current.type)
      }
      return current
    },

    resolve: (key) => {
      return byKey.get(key)?.[0]
    },

    resolveAll: (key) => {
      return [...(byKey.get(key) ?? [])]
    },

    list: (type) => {
      if (type) {
        return [...(byType.get(type)?.keys() ?? [])].sort((a, b) => a.localeCompare(b))
      }
      const keys: string[] = []
      for (const resourceType of ResourceTypeValues) {
        keys.push(...(byType.get(resourceType)?.keys() ?? []))
      }
      return keys.sort((a, b) => a.localeCompare(b))
    },

    getById: (id) => {
      return byId.get(id)
    },

    glob: (pattern) => {
      const matcher = patternToRegex(pattern)
      const result: LayerAsset[] = []
      for (const type of ResourceTypeValues) {
        const winners = byType.get(type)
        if (!winners) {
          continue
        }
        for (const asset of winners.values()) {
          if (matcher.test(asset.key)) {
            result.push(asset)
          }
        }
      }
      return result
    },

    getByType: (type) => {
      const winners = byType.get(type)
      if (!winners) {
        return []
      }
      return [...winners.values()].sort((a, b) => a.key.localeCompare(b.key))
    },

    allTypes: () => ResourceTypeValues,

    stats: () => {
      const byTypeMap = {} as Record<ResourceType, number>
      let total = 0
      for (const type of ResourceTypeValues) {
        const size = byType.get(type)?.size ?? 0
        byTypeMap[type] = size
        total += size
      }
      return {
        totalResources: total,
        byType: byTypeMap,
      }
    },

    toManifest: () => {
      const manifest: ResourceManifest = {
        resources: {} as Record<ResourceType, LayerAsset[]>,
        metadata: {
          generatedAt: new Date().toISOString(),
          layerCount: 0,
          totalResources: 0,
        },
      }

      const layerIds = new Set<string>()
      let total = 0
      for (const type of ResourceTypeValues) {
        const assets = [...(byType.get(type)?.values() ?? [])].sort((a, b) => a.key.localeCompare(b.key))
        manifest.resources[type] = assets
        total += assets.length
        for (const asset of assets) {
          layerIds.add(asset.meta.layerId)
        }
      }

      manifest.metadata.layerCount = layerIds.size
      manifest.metadata.totalResources = total
      return manifest
    },
  }
}
