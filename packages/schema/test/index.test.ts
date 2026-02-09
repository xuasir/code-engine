import type { LayerAsset, LayerConfig, LayerDef, LayerExtendContext, OVFS, OVFSResourceChange, Vona, VonaHooks } from '../src/types'
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

  it('layer:extend hook should consume LayerExtendContext', () => {
    expectTypeOf<LayerExtendContext>().toMatchTypeOf<{
      addLayer: (def: LayerDef) => LayerDef | null
      config: LayerConfig
    }>()

    expectTypeOf<VonaHooks['layer:extend']>().toMatchTypeOf<(
      ctx: LayerExtendContext,
    ) => Promise<void> | void>()
  })
})
