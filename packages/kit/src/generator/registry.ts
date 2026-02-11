import type { Vona } from '@vona-js/schema'
import type {
  ArtifactsRegistrySnapshot,
  ArtifactsResolutionRecord,
  Contribution,
  DeclaredHostRecord,
  HostId,
  HostSpec,
  RegistryHostIRPush,
  RegistryHostRecord,
} from './types'
import { tryUseVona, useVona } from '../context'

interface RegisterHostInput {
  owner: string
  spec: HostSpec
  directContributions: Contribution[]
  irPushes: RegistryHostIRPush[]
}

interface RegistryState {
  hostById: Map<HostId, RegistryHostRecord>
  hostIdByPath: Map<string, HostId>
  pendingIRByTargetHostId: Map<HostId, RegistryHostIRPush[]>
  edges: Set<string>
  resolutions: ArtifactsResolutionRecord[]
  sequence: number
}

const registryByVona = new WeakMap<Vona, RegistryState>()
const RESERVED_OWNER_PREFIX = '__vona_internal__:'

function getRegistry(vona: Vona = useVona()): RegistryState {
  let state = registryByVona.get(vona)
  if (!state) {
    state = {
      hostById: new Map(),
      hostIdByPath: new Map(),
      pendingIRByTargetHostId: new Map(),
      edges: new Set(),
      resolutions: [],
      sequence: 0,
    }
    registryByVona.set(vona, state)
  }
  return state
}

function ensureNonEmpty(input: string, field: string): string {
  const value = input.trim()
  if (!value) {
    throw new Error(`[vona:generate] ${field} must be non-empty`)
  }
  return value
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function normalizeHostSpec(input: HostSpec): HostSpec {
  const hostId = ensureNonEmpty(input.hostId, 'host.hostId')
  const path = normalizePath(ensureNonEmpty(input.path, 'host.path'))

  if (input.mode === 'text') {
    return {
      ...input,
      hostId,
      path,
      hashInputs: input.hashInputs ?? [],
    }
  }

  if (input.mode === 'copyFile') {
    return {
      ...input,
      hostId,
      path,
      from: ensureNonEmpty(input.from, 'host.copyFile.from'),
    }
  }

  if (input.mode === 'copyDir') {
    return {
      ...input,
      hostId,
      path,
      from: ensureNonEmpty(input.from, 'host.copyDir.from'),
      filter: input.filter,
      ignore: input.ignore,
    }
  }

  return {
    ...input,
    hostId,
    path,
    slots: input.slots ?? {},
    directContributions: input.directContributions ?? [],
    marker: {
      mode: input.marker?.mode ?? 'auto',
      onMissingMarker: input.marker?.onMissingMarker ?? 'error',
    },
  }
}

function toEdgeKey(fromHostId: HostId, toHostId: HostId): string {
  return `${fromHostId}->${toHostId}`
}

function mergeStringArray(input: string[], value: string): string[] {
  if (input.includes(value)) {
    return input
  }
  const out = [...input, value]
  out.sort((a, b) => a.localeCompare(b))
  return out
}

function isReservedOwner(owner: string): boolean {
  return owner.startsWith(RESERVED_OWNER_PREFIX)
}

function findReservedOwner(owners: string[]): string | undefined {
  return owners.find(isReservedOwner)
}

function slotShape(host: HostSpec): string {
  if (host.mode !== 'slots') {
    return ''
  }

  const names = Object.keys(host.slots).sort((a, b) => a.localeCompare(b))
  return names
    .map((name) => {
      const slot = host.slots[name]
      const accepts = (slot.accepts ?? []).join(',')
      const inputCount = slot.inputs?.length ?? 0
      return `${name}:${accepts}:${inputCount}`
    })
    .join('|')
}

function isCompatibleHost(left: HostSpec, right: HostSpec): boolean {
  if (left.mode !== right.mode || left.path !== right.path || left.kind !== right.kind) {
    return false
  }

  if (left.mode === 'text' && right.mode === 'text') {
    const leftContent = typeof left.content === 'string' ? left.content : left.content.toString()
    const rightContent = typeof right.content === 'string' ? right.content : right.content.toString()
    return leftContent === rightContent
  }

  if (left.mode === 'copyFile' && right.mode === 'copyFile') {
    return left.from === right.from
  }

  if (left.mode === 'copyDir' && right.mode === 'copyDir') {
    const leftFilter = JSON.stringify(left.filter ?? [])
    const rightFilter = JSON.stringify(right.filter ?? [])
    const leftIgnore = JSON.stringify(left.ignore ?? [])
    const rightIgnore = JSON.stringify(right.ignore ?? [])
    return left.from === right.from && leftFilter === rightFilter && leftIgnore === rightIgnore
  }

  if (left.mode === 'slots' && right.mode === 'slots') {
    const leftTemplate = typeof left.template === 'string' ? left.template : left.template.toString()
    const rightTemplate = typeof right.template === 'string' ? right.template : right.template.toString()
    return leftTemplate === rightTemplate && slotShape(left) === slotShape(right)
  }

  return false
}

function getOrCreateIRStore(host: RegistryHostRecord, channel: string): unknown[] {
  if (!host.irStore[channel]) {
    host.irStore[channel] = []
  }
  return host.irStore[channel]
}

function applyPendingIR(state: RegistryState, host: RegistryHostRecord): void {
  const pending = state.pendingIRByTargetHostId.get(host.spec.hostId)
  if (!pending || pending.length === 0) {
    return
  }

  for (const entry of pending) {
    const bucket = getOrCreateIRStore(host, entry.channel)
    bucket.push(entry.item)
  }

  state.pendingIRByTargetHostId.delete(host.spec.hostId)
}

function appendHostIR(state: RegistryState, host: RegistryHostRecord, pushes: RegistryHostIRPush[]): void {
  for (const push of pushes) {
    const targetHost = state.hostById.get(push.targetHostId)
    if (targetHost) {
      const bucket = getOrCreateIRStore(targetHost, push.channel)
      bucket.push(push.item)
    }
    else {
      const pending = state.pendingIRByTargetHostId.get(push.targetHostId) ?? []
      pending.push(push)
      state.pendingIRByTargetHostId.set(push.targetHostId, pending)
    }

    if (push.fromHostId !== push.targetHostId) {
      state.edges.add(toEdgeKey(push.fromHostId, push.targetHostId))
      if (!host.outHostDeps.includes(push.targetHostId)) {
        host.outHostDeps.push(push.targetHostId)
        host.outHostDeps.sort((a, b) => a.localeCompare(b))
      }
    }
  }
}

function toDeclaredHostRecord(record: RegistryHostRecord): DeclaredHostRecord {
  return {
    id: record.spec.hostId,
    owner: record.owners[0] ?? 'unknown',
    path: record.spec.path,
    mode: record.spec.mode,
    watchCount: record.spec.watch?.length ?? 0,
    slotCount: record.spec.mode === 'slots' ? Object.keys(record.spec.slots).length : 0,
  }
}

export function registerArtifactsHost(input: RegisterHostInput, vona: Vona = useVona()): void {
  const state = getRegistry(vona)
  const owner = ensureNonEmpty(input.owner, 'builder.owner')
  const ownerIsReserved = isReservedOwner(owner)
  const spec = normalizeHostSpec(input.spec)
  const hostId = spec.hostId
  const path = spec.path

  const byPath = state.hostIdByPath.get(path)
  if (byPath && byPath !== hostId) {
    const recordByPath = state.hostById.get(byPath)
    const reservedByPathOwner = recordByPath ? findReservedOwner(recordByPath.owners) : undefined
    if (reservedByPathOwner) {
      throw new Error(`[vona:generate] host path "${path}" is reserved by core owner "${reservedByPathOwner}" (host "${byPath}")`)
    }
    if (ownerIsReserved) {
      throw new Error(`[vona:generate] reserved owner "${owner}" cannot claim path "${path}" already declared by "${byPath}"`)
    }
    throw new Error(`[vona:generate] host path "${path}" already declared by "${byPath}"`)
  }

  const existing = state.hostById.get(hostId)
  if (existing) {
    const reservedExistingOwner = findReservedOwner(existing.owners)
    if (reservedExistingOwner && owner !== reservedExistingOwner) {
      throw new Error(`[vona:generate] host "${hostId}" is reserved by core owner "${reservedExistingOwner}"`)
    }
    if (!reservedExistingOwner && ownerIsReserved) {
      throw new Error(`[vona:generate] reserved owner "${owner}" cannot claim existing host "${hostId}"`)
    }

    if (existing.spec.path !== path) {
      throw new Error(`[vona:generate] host "${hostId}" already bound to path "${existing.spec.path}"`)
    }

    if (!isCompatibleHost(existing.spec, spec)) {
      throw new Error(`[vona:generate] host "${hostId}" has incompatible declarations across modules`)
    }

    existing.owners = mergeStringArray(existing.owners, owner)
    existing.directContributions.push(...input.directContributions)

    appendHostIR(state, existing, input.irPushes)
    return
  }

  state.sequence += 1
  const record: RegistryHostRecord = {
    spec,
    owners: [owner],
    irStore: {},
    directContributions: [...input.directContributions],
    outHostDeps: [],
    registrationSeq: state.sequence,
  }

  state.hostById.set(hostId, record)
  state.hostIdByPath.set(path, hostId)
  applyPendingIR(state, record)
  appendHostIR(state, record, input.irPushes)
}

export function snapshotArtifactsRegistry(vona?: Vona): ArtifactsRegistrySnapshot {
  const ctx = vona ?? tryUseVona()
  if (!ctx) {
    return {
      hosts: [],
      graph: {
        hosts: [],
        resolutions: [],
        edges: [],
      },
    }
  }

  const state = getRegistry(ctx)
  const hosts = [...state.hostById.values()]
    .sort((a, b) => a.spec.hostId.localeCompare(b.spec.hostId))
    .map((record) => {
      return {
        ...record,
        owners: [...record.owners],
        irStore: Object.fromEntries(Object.entries(record.irStore).map(([k, v]) => [k, [...v]])),
        directContributions: [...record.directContributions],
        outHostDeps: [...record.outHostDeps],
      }
    })

  return {
    hosts,
    graph: {
      hosts: hosts.map(toDeclaredHostRecord),
      resolutions: [...state.resolutions],
      edges: [...state.edges]
        .map((edge) => {
          const [fromHostId, toHostId] = edge.split('->')
          return { fromHostId, toHostId }
        })
        .sort((a, b) => {
          const left = `${a.fromHostId}->${a.toHostId}`
          const right = `${b.fromHostId}->${b.toHostId}`
          return left.localeCompare(right)
        }),
    },
  }
}

export function clearArtifactsRegistry(vona: Vona): void {
  registryByVona.delete(vona)
}
