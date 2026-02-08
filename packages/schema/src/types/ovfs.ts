import type { LayerAsset, ResourceManifest } from './asset'
import type { ResourceType } from './layer'

export type OVFSChangeReason = 'hydrate' | 'add' | 'change' | 'unlink' | 'manual'

export type OVFSMutation
  = | { op: 'upsert', asset: LayerAsset }
    | { op: 'removeById', id: string }

export interface OVFSResourceChange {
  type: 'add' | 'change' | 'unlink'
  path: string
  resourceType: ResourceType
  before?: LayerAsset
  after?: LayerAsset
  beforeStack: LayerAsset[]
  afterStack: LayerAsset[]
  reason?: OVFSChangeReason
}

export interface OVFSEntry {
  path: string
  type: ResourceType
  winner: LayerAsset
  stack: LayerAsset[]
}

export interface OVFS {
  get: (path: string) => LayerAsset | undefined
  getStack: (path: string) => LayerAsset[]
  has: (path: string) => boolean
  entries: (type?: ResourceType) => OVFSEntry[]
  mutate: (
    mutations: OVFSMutation[],
    options?: { silent?: boolean, reason?: OVFSChangeReason },
  ) => OVFSResourceChange[]
  subscribe: (callback: (changes: OVFSResourceChange[]) => void) => () => void
  clear: () => void
  stats: () => { totalResources: number, byType: Record<ResourceType, number> }
  toManifest: () => ResourceManifest
}
