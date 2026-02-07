import type { LayerAsset, LayerConfig, LayerDef, Vona, VonaOVFS } from '../src/types'
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
      loader: {
        importName?: string
      }
    }>()
  })

  it('vona should mount ovfs instance directly', () => {
    expectTypeOf<VonaOVFS>().toMatchTypeOf<{
      resolve: (key: string) => LayerAsset | undefined
      list: (type?: any) => string[]
      toManifest: () => any
    }>()
    expectTypeOf<Vona>().toMatchTypeOf<{
      ovfs?: VonaOVFS
    }>()
  })
})
