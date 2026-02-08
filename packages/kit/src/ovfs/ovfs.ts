import type {
  LayerAsset,
  OVFS,
  OVFSChangeReason,
  OVFSEntry,
  OVFSMutation,
  OVFSResourceChange,
  ResourceManifest,
  ResourceType,
} from '@vona-js/schema'

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

function isStackEqual(before: LayerAsset[], after: LayerAsset[]): boolean {
  if (before.length !== after.length) {
    return false
  }
  for (let i = 0; i < before.length; i++) {
    const left = before[i]
    const right = after[i]
    if (left.id !== right.id || left !== right) {
      return false
    }
  }
  return true
}

export function createOVFS(): OVFS {
  const byPath = new Map<string, LayerAsset[]>()
  const byType = new Map<ResourceType, Map<string, LayerAsset>>()
  const byId = new Map<string, LayerAsset>()
  const callbacks: Array<(changes: OVFSResourceChange[]) => void> = []

  const removeWinner = (type: ResourceType, path: string): void => {
    byType.get(type)?.delete(path)
  }

  const setWinner = (path: string): void => {
    const stack = byPath.get(path) ?? []
    const winner = stack[0]
    if (!winner) {
      return
    }

    winner.overrides = stack.slice(1).map(toOverride)
    if (!byType.has(winner.type)) {
      byType.set(winner.type, new Map<string, LayerAsset>())
    }
    byType.get(winner.type)!.set(path, winner)
  }

  const syncPath = (path: string, type: ResourceType): void => {
    const stack = byPath.get(path) ?? []
    if (stack.length === 0) {
      byPath.delete(path)
      removeWinner(type, path)
      return
    }

    stack.sort(compareAsset)
    byPath.set(path, stack)
    setWinner(path)
  }

  const upsertAsset = (asset: LayerAsset): void => {
    const previous = byId.get(asset.id)
    if (previous && previous.key !== asset.key) {
      const previousStack = (byPath.get(previous.key) ?? []).filter(item => item.id !== previous.id)
      if (previousStack.length === 0) {
        byPath.delete(previous.key)
        removeWinner(previous.type, previous.key)
      }
      else {
        byPath.set(previous.key, previousStack)
        syncPath(previous.key, previous.type)
      }
    }

    byId.set(asset.id, asset)

    const nextStack = byPath.get(asset.key) ?? []
    const index = nextStack.findIndex(item => item.id === asset.id)
    if (index >= 0) {
      nextStack[index] = asset
    }
    else {
      nextStack.push(asset)
    }

    byPath.set(asset.key, nextStack)
    syncPath(asset.key, asset.type)
  }

  const removeByIdInternal = (id: string): LayerAsset | undefined => {
    const current = byId.get(id)
    if (!current) {
      return undefined
    }

    byId.delete(id)
    const nextStack = (byPath.get(current.key) ?? []).filter(item => item.id !== id)
    if (nextStack.length === 0) {
      byPath.delete(current.key)
      removeWinner(current.type, current.key)
    }
    else {
      byPath.set(current.key, nextStack)
      syncPath(current.key, current.type)
    }

    return current
  }

  const emitChange = (changes: OVFSResourceChange[]): void => {
    if (changes.length === 0) {
      return
    }
    callbacks.forEach(cb => cb(changes))
  }

  const mutate = (
    mutations: OVFSMutation[],
    options?: { silent?: boolean, reason?: OVFSChangeReason },
  ): OVFSResourceChange[] => {
    if (mutations.length === 0) {
      return []
    }

    const reason = options?.reason
    const touchedPaths: string[] = []
    const beforeMap = new Map<string, LayerAsset | undefined>()
    const beforeStackMap = new Map<string, LayerAsset[]>()

    const touchPath = (path: string): void => {
      if (!beforeStackMap.has(path)) {
        beforeMap.set(path, byPath.get(path)?.[0])
        beforeStackMap.set(path, [...(byPath.get(path) ?? [])])
        touchedPaths.push(path)
      }
    }

    for (const mutation of mutations) {
      if (mutation.op === 'upsert') {
        const previousById = byId.get(mutation.asset.id)
        if (previousById && previousById.key !== mutation.asset.key) {
          touchPath(previousById.key)
        }
        touchPath(mutation.asset.key)
        upsertAsset(mutation.asset)
        continue
      }

      const current = byId.get(mutation.id)
      if (!current) {
        continue
      }
      touchPath(current.key)
      removeByIdInternal(mutation.id)
    }

    const changes: OVFSResourceChange[] = []

    for (const path of touchedPaths) {
      const before = beforeMap.get(path)
      const after = byPath.get(path)?.[0]
      const beforeStack = beforeStackMap.get(path) ?? []
      const afterStack = [...(byPath.get(path) ?? [])]

      if (!before && after) {
        changes.push({
          type: 'add',
          path,
          resourceType: after.type,
          before,
          after,
          beforeStack,
          afterStack,
          reason,
        })
        continue
      }

      if (before && !after) {
        changes.push({
          type: 'unlink',
          path,
          resourceType: before.type,
          before,
          after,
          beforeStack,
          afterStack,
          reason,
        })
        continue
      }

      if (before && after) {
        if (before.id !== after.id || before !== after || !isStackEqual(beforeStack, afterStack)) {
          changes.push({
            type: 'change',
            path,
            resourceType: after.type,
            before,
            after,
            beforeStack,
            afterStack,
            reason,
          })
        }
      }
    }

    if (!options?.silent) {
      emitChange(changes)
    }

    return changes
  }

  const entries = (type?: ResourceType): OVFSEntry[] => {
    const rows: OVFSEntry[] = []

    const collectByType = (resourceType: ResourceType): void => {
      const winners = byType.get(resourceType)
      if (!winners) {
        return
      }
      const paths = [...winners.keys()].sort((a, b) => a.localeCompare(b))
      for (const path of paths) {
        const winner = winners.get(path)
        if (!winner) {
          continue
        }
        rows.push({
          path,
          type: resourceType,
          winner,
          stack: [...(byPath.get(path) ?? [])],
        })
      }
    }

    if (type) {
      collectByType(type)
      return rows
    }

    for (const resourceType of ResourceTypeValues) {
      collectByType(resourceType)
    }

    return rows
  }

  return {
    get: (path) => {
      return byPath.get(path)?.[0]
    },

    getStack: (path) => {
      return [...(byPath.get(path) ?? [])]
    },

    has: (path) => {
      return (byPath.get(path)?.length ?? 0) > 0
    },

    entries,

    mutate,

    subscribe: (callback) => {
      callbacks.push(callback)
      return () => {
        const index = callbacks.indexOf(callback)
        if (index >= 0) {
          callbacks.splice(index, 1)
        }
      }
    },

    clear: () => {
      byPath.clear()
      byType.clear()
      byId.clear()
    },

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
