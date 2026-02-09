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

const EMPTY_STACK: LayerAsset[] = []
const EMPTY_OVERRIDES: Partial<LayerAsset>[] = []
const INDEX_BUILD_THRESHOLD = 8

export function createOVFS(): OVFS {
  const byPath = new Map<string, LayerAsset[]>()
  const byPathIndex = new Map<string, Map<string, number>>()
  const byType = new Map<ResourceType, Map<string, LayerAsset>>()
  const byId = new Map<string, LayerAsset>()
  const callbacks: Array<(changes: OVFSResourceChange[]) => void> = []
  const sortedPathCache = new Map<ResourceType, string[]>()

  const clearSortedPathCache = (): void => {
    sortedPathCache.clear()
  }

  const ensurePathStack = (path: string): LayerAsset[] => {
    let stack = byPath.get(path)
    if (!stack) {
      stack = []
      byPath.set(path, stack)
    }
    return stack
  }

  const rebuildPathIndex = (path: string, stack: LayerAsset[]): void => {
    if (stack.length <= 1) {
      byPathIndex.delete(path)
      return
    }

    let indexById = byPathIndex.get(path)
    if (!indexById) {
      indexById = new Map<string, number>()
      byPathIndex.set(path, indexById)
    }
    else {
      indexById.clear()
    }

    for (let i = 0; i < stack.length; i++) {
      indexById.set(stack[i].id, i)
    }
  }

  const removeWinner = (type: ResourceType, path: string): void => {
    byType.get(type)?.delete(path)
  }

  const setWinner = (path: string, stack: LayerAsset[]): void => {
    const winner = stack[0]
    if (!winner) {
      return
    }

    if (stack.length <= 1) {
      winner.overrides = EMPTY_OVERRIDES
    }
    else {
      winner.overrides = stack.slice(1).map(toOverride)
    }

    if (!byType.has(winner.type)) {
      byType.set(winner.type, new Map<string, LayerAsset>())
    }
    byType.get(winner.type)!.set(path, winner)
  }

  const syncPath = (path: string, type: ResourceType): void => {
    const stack = byPath.get(path) ?? EMPTY_STACK
    if (stack.length === 0) {
      byPath.delete(path)
      byPathIndex.delete(path)
      removeWinner(type, path)
      return
    }

    stack.sort(compareAsset)
    rebuildPathIndex(path, stack)
    setWinner(path, stack)
  }

  const removeFromPath = (path: string, id: string): boolean => {
    const stack = byPath.get(path)
    if (!stack || stack.length === 0) {
      return false
    }

    const indexById = byPathIndex.get(path)
    if (!indexById) {
      const index = stack.findIndex(item => item.id === id)
      if (index < 0) {
        return false
      }
      const lastIndex = stack.length - 1
      if (index !== lastIndex) {
        stack[index] = stack[lastIndex]
      }
      stack.pop()
      if (stack.length === 0) {
        byPath.delete(path)
        byPathIndex.delete(path)
      }
      return true
    }

    const index = indexById.get(id)
    if (typeof index !== 'number') {
      return false
    }

    const lastIndex = stack.length - 1
    if (index !== lastIndex) {
      const last = stack[lastIndex]
      stack[index] = last
      indexById.set(last.id, index)
    }
    stack.pop()
    indexById.delete(id)

    if (stack.length === 0) {
      byPath.delete(path)
      byPathIndex.delete(path)
    }

    return true
  }

  const upsertAsset = (asset: LayerAsset, dirtyPaths: Set<string>): void => {
    const previous = byId.get(asset.id)
    if (previous && previous.key !== asset.key) {
      if (removeFromPath(previous.key, previous.id)) {
        dirtyPaths.add(previous.key)
      }
    }

    byId.set(asset.id, asset)

    const stack = ensurePathStack(asset.key)
    const indexById = byPathIndex.get(asset.key)
    const samePathUpdate = previous?.key === asset.key

    if (samePathUpdate) {
      const found = indexById?.get(asset.id)
      const index = typeof found === 'number'
        ? found
        : stack.findIndex(item => item.id === asset.id)

      if (index >= 0) {
        if (stack[index] !== asset) {
          stack[index] = asset
          dirtyPaths.add(asset.key)
        }
      }
      else {
        const nextIndex = stack.length
        stack.push(asset)
        if (indexById) {
          indexById.set(asset.id, nextIndex)
        }
        else if (stack.length > INDEX_BUILD_THRESHOLD) {
          rebuildPathIndex(asset.key, stack)
        }
        dirtyPaths.add(asset.key)
      }
    }
    else {
      const nextIndex = stack.length
      stack.push(asset)
      if (indexById) {
        indexById.set(asset.id, nextIndex)
      }
      else if (stack.length > INDEX_BUILD_THRESHOLD) {
        rebuildPathIndex(asset.key, stack)
      }
      dirtyPaths.add(asset.key)
    }
  }

  const removeByIdInternal = (id: string, dirtyPaths: Set<string>): LayerAsset | undefined => {
    const current = byId.get(id)
    if (!current) {
      return undefined
    }

    byId.delete(id)
    if (removeFromPath(current.key, id)) {
      dirtyPaths.add(current.key)
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
    const dirtyPaths = new Set<string>()

    const touchPath = (path: string): void => {
      if (!beforeStackMap.has(path)) {
        const stack = byPath.get(path) ?? EMPTY_STACK
        beforeMap.set(path, stack[0])
        beforeStackMap.set(path, [...stack])
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
        upsertAsset(mutation.asset, dirtyPaths)
        continue
      }

      const current = byId.get(mutation.id)
      if (!current) {
        continue
      }
      touchPath(current.key)
      removeByIdInternal(mutation.id, dirtyPaths)
    }

    for (const path of dirtyPaths) {
      const beforeStack = beforeStackMap.get(path)
      const currentStack = byPath.get(path) ?? EMPTY_STACK
      if (beforeStack && isStackEqual(beforeStack, currentStack)) {
        continue
      }
      const type = beforeMap.get(path)?.type ?? currentStack[0]?.type
      if (!type) {
        continue
      }
      syncPath(path, type)
    }

    if (dirtyPaths.size > 0) {
      clearSortedPathCache()
    }

    const changes: OVFSResourceChange[] = []

    for (const path of touchedPaths) {
      const before = beforeMap.get(path)
      const afterStackView = byPath.get(path) ?? EMPTY_STACK
      const after = afterStackView[0]
      const beforeStack = beforeStackMap.get(path) ?? EMPTY_STACK
      const stackChanged = !isStackEqual(beforeStack, afterStackView)

      if (!before && after) {
        const afterStack = [...afterStackView]
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
        const afterStack = [...afterStackView]
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
        if (before.id !== after.id || before !== after || stackChanged) {
          const afterStack = [...afterStackView]
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
      let paths = sortedPathCache.get(resourceType)
      if (!paths) {
        paths = [...winners.keys()].sort((a, b) => a.localeCompare(b))
        sortedPathCache.set(resourceType, paths)
      }
      for (const path of paths) {
        const winner = winners.get(path)
        if (!winner) {
          continue
        }
        rows.push({
          path,
          type: resourceType,
          winner,
          stack: [...(byPath.get(path) ?? EMPTY_STACK)],
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
      return [...(byPath.get(path) ?? EMPTY_STACK)]
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
      byPathIndex.clear()
      byType.clear()
      byId.clear()
      clearSortedPathCache()
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
