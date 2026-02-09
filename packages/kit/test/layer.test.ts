import type { LayerDef, OVFSMutation, ResourceScanConfig } from '@vona-js/schema'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAsset, scanLayer, scanSingleFile } from '../src/layer/scanner'
import { createOVFS } from '../src/ovfs/ovfs'

describe('scanner', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'layer')

  const testLayer: LayerDef = {
    id: 'test',
    source: {
      type: 'local',
      root: fixturesDir,
      dynamic: false,
    },
    priority: 10000,
  }

  const resourceConfig: Record<string, ResourceScanConfig> = {
    components: { enabled: true, name: 'components', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
    layouts: { enabled: true, name: 'layouts', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
    composables: { enabled: true, name: 'composables', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
    apis: { enabled: true, name: 'apis', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
    icons: { enabled: true, name: 'icons', pattern: ['**/*.svg'], ignore: [] },
    pages: { enabled: true, name: 'pages', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  }

  it('should scan resources by configured rules', async () => {
    const assets = await scanLayer(testLayer, resourceConfig)

    expect(assets.filter(asset => asset.type === 'components')).toHaveLength(4)
    expect(assets.filter(asset => asset.type === 'layouts')).toHaveLength(3)
    expect(assets.filter(asset => asset.type === 'composables')).toHaveLength(2)
    expect(assets.filter(asset => asset.type === 'apis')).toHaveLength(2)
    expect(assets.filter(asset => asset.type === 'icons')).toHaveLength(1)
    expect(assets.filter(asset => asset.type === 'pages')).toHaveLength(3)
  })

  it('should generate normalized keys and route metadata', async () => {
    const assets = await scanLayer(testLayer, resourceConfig)
    const keys = assets.map(asset => asset.key)

    expect(keys).toContain('components/HelloWorld')
    expect(keys).toContain('components/TestB')
    expect(keys).toContain('components/Test')
    expect(keys).toContain('components/UiButton')
    expect(keys).toContain('layouts/Default')
    expect(keys).toContain('layouts/Other')
    expect(keys).toContain('layouts/OtherTest')
    expect(keys).toContain('composables/use-user')
    expect(keys).toContain('composables/useCounter')
    expect(keys).toContain('apis/org')
    expect(keys).toContain('apis/user')
    expect(keys).toContain('icons/Logo')
    expect(keys).toContain('pages/index')
    expect(keys).toContain('pages/users/[id]')
    expect(keys).toContain('pages/users/create')

    const dynamicPage = assets.find(asset => asset.key === 'pages/users/[id]')
    const staticPage = assets.find(asset => asset.key === 'pages/users/create')
    expect(dynamicPage?.meta.routePath).toBe('/users/:id')
    expect(staticPage?.meta.routePath).toBe('/users/create')
    expect((staticPage?.meta.routeScore ?? 0) > (dynamicPage?.meta.routeScore ?? 0)).toBe(true)
  })

  it('scanSingleFile 应同步返回并遵循扫描规则', () => {
    const result = scanSingleFile('users/[id].vue', testLayer, 'pages', 'pages')

    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('pages/users/[id]')
    expect(result).not.toBeInstanceOf(Promise)
  })
})

describe('ovfs', () => {
  function mutateAll(ovfs: ReturnType<typeof createOVFS>, assets: ReturnType<typeof createAsset>[]): void {
    const mutations: OVFSMutation[] = assets.map(asset => ({ op: 'upsert', asset }))
    ovfs.mutate(mutations, { reason: 'manual' })
  }

  it('should resolve winner by priority', () => {
    const ovfs = createOVFS()

    const layer1: LayerDef = { id: 'base', source: { type: 'local', root: '/base' }, priority: 10 }
    const layer2: LayerDef = { id: 'user', source: { type: 'local', root: '/user' }, priority: 100 }

    const asset1 = createAsset('components/Button.vue', layer1, 'components', 'components')
    const asset2 = createAsset('components/Button.vue', layer2, 'components', 'components')

    mutateAll(ovfs, [asset1, asset2])

    const resolved = ovfs.get('components/Button')
    expect(resolved?.meta.layerId).toBe('user')
    expect(resolved?.overrides?.[0].meta?.layerId).toBe('base')
  })

  it('should remove by id and fallback to lower layer', () => {
    const ovfs = createOVFS()
    const layer1: LayerDef = { id: 'base', source: { type: 'local', root: '/base' }, priority: 10 }
    const layer2: LayerDef = { id: 'user', source: { type: 'local', root: '/user' }, priority: 100 }

    const asset1 = createAsset('components/Button.vue', layer1, 'components', 'components')
    const asset2 = createAsset('components/Button.vue', layer2, 'components', 'components')

    mutateAll(ovfs, [asset1, asset2])
    ovfs.mutate([{ op: 'removeById', id: asset2.id }], { reason: 'manual' })

    const resolved = ovfs.get('components/Button')
    expect(resolved?.meta.layerId).toBe('base')
  })

  it('should keep defs order when priority is equal', () => {
    const ovfs = createOVFS()
    const layer1: LayerDef = {
      id: 'first',
      source: { type: 'local', root: '/first' },
      priority: 100,
      meta: { __order: 0 },
    }
    const layer2: LayerDef = {
      id: 'second',
      source: { type: 'local', root: '/second' },
      priority: 100,
      meta: { __order: 1 },
    }

    const asset1 = createAsset('components/Button.vue', layer1, 'components', 'components')
    const asset2 = createAsset('components/Button.vue', layer2, 'components', 'components')

    mutateAll(ovfs, [asset1, asset2])
    expect(ovfs.get('components/Button')?.meta.layerId).toBe('first')
  })

  it('should expose paths by entries', () => {
    const ovfs = createOVFS()
    const layer: LayerDef = { id: 'base', source: { type: 'local', root: '/base' }, priority: 10 }

    mutateAll(ovfs, [
      createAsset('components/Button.vue', layer, 'components', 'components'),
      createAsset('plugins/a.ts', layer, 'plugins', 'plugins'),
    ])

    expect(ovfs.entries('components').map(item => item.path)).toEqual(['components/Button'])
    expect(ovfs.entries().map(item => item.path)).toEqual(['components/Button', 'plugins/a'])
  })
})
