import type { GenerateConfig, LayerAsset, LayerConfig, LayerDef, LayerRegistry, OVFS, OVFSResourceChange, Vona, VonaHooks } from '../src/types'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('schema types', () => {
  it('layer source should support local and remote', () => {
    const localLayer: LayerDef = {
      id: 'local',
      source: { type: 'local', root: '/tmp/local', dynamic: true },
      priority: 100,
    }
    const remoteLayer: LayerDef = {
      id: 'remote',
      source: { type: 'remote', root: '@scope/core', version: '1.0.0' },
      priority: 50,
    }
    expect(localLayer.source.type).toBe('local')
    expect(remoteLayer.source.type).toBe('remote')
  })

  it('layer config should include remote placeholder options', () => {
    const config: LayerConfig = {
      enabled: true,
      defs: [],
      remote: {
        cacheDir: '.vona/layers',
        preferCache: true,
      },
    }
    expect(config.remote?.cacheDir).toBe('.vona/layers')
    expect(config.remote?.preferCache).toBe(true)
  })

  it('generate config should include report controls', () => {
    const config: GenerateConfig = {
      enabled: true,
      outputDir: '.vona',
      mode: 'disk',
      debounceMs: 80,
      clean: false,
      cacheFile: '.cache/generate-state.json',
      writeConcurrency: 8,
      report: {
        enabled: true,
        file: '.cache/generate-report.json',
      },
    }
    expect(config.mode).toBe('disk')
    expect(config.report.enabled).toBe(true)
  })

  it('layer asset should use key and route metadata', () => {
    expectTypeOf<LayerAsset>().toMatchTypeOf<{
      key: string
      meta: {
        layerId: string
        routePath?: string
        routeScore?: number
      }
      config: {
        export: 'default' | 'named'
      }
    }>()
  })

  it('layer meta should support internal reserved fields and extension fields', () => {
    const layer: LayerDef = {
      id: 'user-layer',
      source: { type: 'local', root: '/tmp/user' },
      priority: 100,
      meta: {
        __order: 1,
        __origin: 'user',
        __scanPolicy: 'user',
        customFlag: true,
      },
    }

    expect(layer.meta?.__origin).toBe('user')
    expect(layer.meta?.__scanPolicy).toBe('user')

    expectTypeOf<LayerDef>().toMatchTypeOf<{
      meta?: {
        __order?: number
        __origin?: 'user' | 'module' | 'core'
        __scanPolicy?: 'user' | 'standard'
        [key: string]: unknown
      }
    }>()
  })

  it('vona should mount ovfs instance directly', () => {
    expectTypeOf<OVFS>().toMatchTypeOf<{
      get: (path: string) => LayerAsset | undefined
      getStack: (path: string) => LayerAsset[]
      has: (path: string) => boolean
      entries: (type?: any) => any[]
      mutate: (mutations: any[], options?: any) => OVFSResourceChange[]
      subscribe: (callback: (changes: OVFSResourceChange[]) => void) => () => void
      clear: () => void
      stats: () => { totalResources: number }
      toManifest: () => any
    }>()
    expectTypeOf<Vona>().toMatchTypeOf<{
      ovfs: OVFS
    }>()
  })

  it('vona should mount layerRegistry instance directly', () => {
    expectTypeOf<LayerRegistry>().toMatchTypeOf<{
      register: (def: LayerDef) => void
      unregister: (id: string) => void
      getOrdered: () => LayerDef[]
      get: (id: string) => LayerDef | undefined
      has: (id: string) => boolean
      ids: () => string[]
    }>()
    expectTypeOf<Vona>().toMatchTypeOf<{
      layerRegistry: LayerRegistry
    }>()
  })

  it('ovfs change event should carry path and stack data', () => {
    expectTypeOf<OVFSResourceChange>().toMatchTypeOf<{
      path: string
      beforeStack: LayerAsset[]
      afterStack: LayerAsset[]
    }>()
  })

  it('ovfs:change hook should consume ovfs resource changes', () => {
    expectTypeOf<VonaHooks['ovfs:change']>().toMatchTypeOf<(
      changes: OVFSResourceChange[],
      vona: Vona,
    ) => Promise<void> | void>()
  })
})
