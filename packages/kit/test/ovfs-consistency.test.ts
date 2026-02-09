import type {
  LayerAsset,
  LayerDef,
  OVFSChangeReason,
  OVFSMutation,
  OVFSResourceChange,
  ResourceType,
} from '@vona-js/schema'
import { describe, expect, it } from 'vitest'
import { createAsset } from '../src/layer/scanner'
import { createOVFS } from '../src/ovfs/ovfs'

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
    if (before[i].id !== after[i].id || before[i] !== after[i]) {
      return false
    }
  }
  return true
}

function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function normalizeChanges(changes: OVFSResourceChange[]): Array<{
  type: string
  path: string
  resourceType: ResourceType
  beforeId?: string
  afterId?: string
  beforeStack: string[]
  afterStack: string[]
  reason?: OVFSChangeReason
}> {
  return changes.map(change => ({
    type: change.type,
    path: change.path,
    resourceType: change.resourceType,
    beforeId: change.before?.id,
    afterId: change.after?.id,
    beforeStack: change.beforeStack.map(item => item.id),
    afterStack: change.afterStack.map(item => item.id),
    reason: change.reason,
  }))
}

function normalizeEntries(entries: Array<{
  path: string
  type: ResourceType
  winner: LayerAsset
  stack: LayerAsset[]
}>): Array<{
  path: string
  type: ResourceType
  winnerId: string
  stackIds: string[]
}> {
  return entries.map(entry => ({
    path: entry.path,
    type: entry.type,
    winnerId: entry.winner.id,
    stackIds: entry.stack.map(item => item.id),
  }))
}

function createReferenceOVFS() {
  const byPath = new Map<string, LayerAsset[]>()
  const byId = new Map<string, LayerAsset>()

  const syncPath = (path: string): void => {
    const stack = byPath.get(path) ?? []
    if (stack.length === 0) {
      byPath.delete(path)
      return
    }
    stack.sort(compareAsset)
    byPath.set(path, stack)
  }

  const upsertAsset = (asset: LayerAsset): void => {
    const previous = byId.get(asset.id)
    if (previous && previous.key !== asset.key) {
      const previousStack = (byPath.get(previous.key) ?? []).filter(item => item.id !== previous.id)
      if (previousStack.length === 0) {
        byPath.delete(previous.key)
      }
      else {
        byPath.set(previous.key, previousStack)
        syncPath(previous.key)
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
    syncPath(asset.key)
  }

  const removeById = (id: string): void => {
    const current = byId.get(id)
    if (!current) {
      return
    }
    byId.delete(id)
    const nextStack = (byPath.get(current.key) ?? []).filter(item => item.id !== id)
    if (nextStack.length === 0) {
      byPath.delete(current.key)
    }
    else {
      byPath.set(current.key, nextStack)
      syncPath(current.key)
    }
  }

  const mutate = (
    mutations: OVFSMutation[],
    options?: { silent?: boolean, reason?: OVFSChangeReason },
  ): OVFSResourceChange[] => {
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
      }
      else {
        const current = byId.get(mutation.id)
        if (!current) {
          continue
        }
        touchPath(current.key)
        removeById(mutation.id)
      }
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
          reason: options?.reason,
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
          reason: options?.reason,
        })
        continue
      }

      if (before && after && (before.id !== after.id || before !== after || !isStackEqual(beforeStack, afterStack))) {
        changes.push({
          type: 'change',
          path,
          resourceType: after.type,
          before,
          after,
          beforeStack,
          afterStack,
          reason: options?.reason,
        })
      }
    }

    return changes
  }

  const get = (path: string): LayerAsset | undefined => byPath.get(path)?.[0]
  const getStack = (path: string): LayerAsset[] => [...(byPath.get(path) ?? [])]

  const entries = () => {
    const rows: Array<{ path: string, type: ResourceType, winner: LayerAsset, stack: LayerAsset[] }> = []
    for (const type of ResourceTypeValues) {
      const paths: string[] = []
      for (const [path, stack] of byPath.entries()) {
        if (stack[0]?.type === type) {
          paths.push(path)
        }
      }
      paths.sort((a, b) => a.localeCompare(b))
      for (const path of paths) {
        const stack = byPath.get(path) ?? []
        const winner = stack[0]
        if (!winner) {
          continue
        }
        rows.push({
          path,
          type,
          winner,
          stack: [...stack],
        })
      }
    }
    return rows
  }

  return {
    mutate,
    get,
    getStack,
    entries,
  }
}

describe('ovfs 一致性', () => {
  it('随机 mutation 序列应与参考实现保持一致', () => {
    const layers: LayerDef[] = [
      {
        id: 'base',
        source: { type: 'local', root: '/base' },
        priority: 10,
        meta: { __order: 0 },
      },
      {
        id: 'mid',
        source: { type: 'local', root: '/mid' },
        priority: 50,
        meta: { __order: 1 },
      },
      {
        id: 'high',
        source: { type: 'local', root: '/high' },
        priority: 100,
        meta: { __order: 2 },
      },
    ]
    const candidates = [
      { type: 'components' as ResourceType, entry: 'components/Button.vue', rootName: 'components' },
      { type: 'components' as ResourceType, entry: 'components/Card.vue', rootName: 'components' },
      { type: 'plugins' as ResourceType, entry: 'plugins/auth.ts', rootName: 'plugins' },
      { type: 'plugins' as ResourceType, entry: 'plugins/sso/admin/index.ts', rootName: 'plugins' },
      { type: 'pages' as ResourceType, entry: 'pages/users/[id].vue', rootName: 'pages' },
      { type: 'pages' as ResourceType, entry: 'pages/(admin)/dashboard.vue', rootName: 'pages' },
    ]
    const reasons: OVFSChangeReason[] = ['manual', 'add', 'change', 'unlink']

    for (let round = 0; round < 4; round++) {
      const rng = createRng(20250209 + round)
      const ovfs = createOVFS()
      const reference = createReferenceOVFS()
      const observedPaths = new Set<string>()
      const removableIds: string[] = []

      for (let i = 0; i < 180; i++) {
        const batchSize = 1 + Math.floor(rng() * 6)
        const mutations: OVFSMutation[] = []

        for (let b = 0; b < batchSize; b++) {
          if (rng() < 0.72) {
            const layer = layers[Math.floor(rng() * layers.length)]
            const candidate = candidates[Math.floor(rng() * candidates.length)]
            const created = createAsset(candidate.entry, layer, candidate.type, candidate.rootName)

            let asset: LayerAsset = created
            if (rng() < 0.15) {
              asset = {
                ...asset,
                key: `${asset.key}-moved`,
              }
            }
            else if (rng() < 0.2) {
              asset = {
                ...asset,
                loader: {
                  ...asset.loader,
                  dynamicImport: () => `import('${asset.path.relative}?v=${i}')`,
                },
              }
            }

            observedPaths.add(asset.key)
            removableIds.push(asset.id)
            mutations.push({
              op: 'upsert',
              asset,
            })
          }
          else {
            let id = ''
            if (removableIds.length > 0 && rng() < 0.85) {
              id = removableIds[Math.floor(rng() * removableIds.length)]
            }
            else {
              id = `missing:${Math.floor(rng() * 9999)}`
            }
            mutations.push({
              op: 'removeById',
              id,
            })
          }
        }

        const reason = reasons[Math.floor(rng() * reasons.length)]
        const silent = rng() < 0.2
        const left = ovfs.mutate(mutations, { reason, silent })
        const right = reference.mutate(mutations, { reason, silent })
        expect(normalizeChanges(left)).toEqual(normalizeChanges(right))

        const checkPaths = [...observedPaths]
        for (const path of checkPaths) {
          expect(ovfs.get(path)?.id).toBe(reference.get(path)?.id)
          expect(ovfs.getStack(path).map(item => item.id)).toEqual(reference.getStack(path).map(item => item.id))
        }

        if (i % 12 === 0) {
          expect(normalizeEntries(ovfs.entries())).toEqual(normalizeEntries(reference.entries()))
        }
      }

      expect(normalizeEntries(ovfs.entries())).toEqual(normalizeEntries(reference.entries()))
    }
  })
})
