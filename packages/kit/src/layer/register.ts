import type { LayerConfig, LayerDef, Vona } from '@vona-js/schema'
import { existsSync } from 'node:fs'
import { PRIORITY } from '@vona-js/schema'
import { isAbsolute, join, normalize, resolve } from 'pathe'
import { useVona } from '../context'

interface LayerRegistrationState {
  closed: boolean
  nextOrder: number
}

const registrationStates = new WeakMap<Vona, LayerRegistrationState>()

function getRegistrationState(vona: Vona): LayerRegistrationState {
  const current = registrationStates.get(vona)
  if (current) {
    return current
  }
  const initial: LayerRegistrationState = {
    closed: false,
    nextOrder: 0,
  }
  registrationStates.set(vona, initial)
  return initial
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

export function closeLayerRegistration(vona: Vona): void {
  getRegistrationState(vona).closed = true
}

export function createUserSrcLayer(rootDir: string): LayerDef | null {
  const srcPath = join(rootDir, 'src')
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

export function registerLayer(def: LayerDef, vona: Vona = useVona()): LayerDef | null {
  const state = getRegistrationState(vona)
  if (state.closed) {
    throw new Error('addLayer can only be used before modules:done')
  }

  const layerConfig = vona.options.layer
  const normalized = resolveLayerDefRoot(vona.options.__rootDir, def)
  const explicitOrder = normalized.meta?.__order
  const explicitOrigin = normalized.meta?.__origin
  const explicitScanPolicy = normalized.meta?.__scanPolicy
  const order = typeof explicitOrder === 'number' ? explicitOrder : state.nextOrder++
  const origin = explicitOrigin === 'user' || explicitOrigin === 'module'
    ? explicitOrigin
    : 'module'
  const scanPolicy = explicitScanPolicy === 'user' || explicitScanPolicy === 'standard'
    ? explicitScanPolicy
    : 'standard'
  const withOrder: LayerDef = {
    ...normalized,
    meta: {
      ...(normalized.meta ?? {}),
      __order: order,
      __origin: origin,
      __scanPolicy: scanPolicy,
    },
  }

  const materialized = materializeRemoteLayer(vona.options.__rootDir, layerConfig, withOrder)
  if (!materialized) {
    return null
  }

  if (vona.layerRegistry.has(materialized.id)) {
    throw new Error(`Duplicate layer id found: ${materialized.id}`)
  }

  vona.layerRegistry.register(materialized)
  return materialized
}
