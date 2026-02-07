import type { LayerConfig, LayerDef, ResourceScanConfig } from '@vona-js/schema'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createPipeline } from '../src/layer/pipeline'
import { createLayerRegistry } from '../src/layer/registry'
import { createAsset, scanLayer } from '../src/layer/scanner'
import { createOVFS } from '../src/ovfs/ovfs'

describe('target.md - 配置测试', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'target')

  it('应该加载 target 配置结构', async () => {
    const { loadVonaConfig } = await import('../src/loader/config')
    const config = await loadVonaConfig({ cwd: fixturesDir })

    expect(config.layer.enabled).toBe(true)
    expect(config.layer.defs).toHaveLength(1)
    expect(config.layer.defs[0].id).toBe('user-common')
    expect(config.layer.defs[0].priority).toBe(100)
    expect(config.layer.remote?.cacheDir).toBe('.vona/layers')
    expect(config.layer.remote?.preferCache).toBe(true)
  })
})

describe('target.md - 浅层扫描测试 (plugins)', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'target')
  const pluginsConfig: Record<string, ResourceScanConfig> = {
    plugins: { enabled: true, name: 'plugins', pattern: ['**/*.{ts,js}'], ignore: [] },
  }

  it('应按 key 扫描 plugins', async () => {
    const layer1: LayerDef = {
      id: 'layer1',
      source: { type: 'local', root: join(fixturesDir, 'layer1'), dynamic: false },
      priority: 50,
    }
    const layer2: LayerDef = {
      id: 'layer2',
      source: { type: 'local', root: join(fixturesDir, 'layer2'), dynamic: false },
      priority: 100,
    }

    const assets1 = await scanLayer(layer1, pluginsConfig)
    const assets2 = await scanLayer(layer2, pluginsConfig)

    expect(assets1.map(asset => asset.key).sort()).toEqual(['plugins/a', 'plugins/b'])
    expect(assets2.map(asset => asset.key).sort()).toEqual(['plugins/b', 'plugins/c'])
  })

  it('plugins/b 的 winner 应来自高优先级层', async () => {
    const layer1: LayerDef = {
      id: 'layer1',
      source: { type: 'local', root: join(fixturesDir, 'layer1'), dynamic: false },
      priority: 50,
    }
    const layer2: LayerDef = {
      id: 'layer2',
      source: { type: 'local', root: join(fixturesDir, 'layer2'), dynamic: false },
      priority: 100,
    }

    const assets1 = await scanLayer(layer1, pluginsConfig)
    const assets2 = await scanLayer(layer2, pluginsConfig)
    const ovfs = createOVFS()
    ovfs.addMany([...assets1, ...assets2])

    const resolved = ovfs.resolve('plugins/b')
    expect(resolved?.meta.layerId).toBe('layer2')

    const stack = ovfs.resolveAll('plugins/b')
    expect(stack).toHaveLength(2)
    expect(stack[0].meta.layerId).toBe('layer2')
    expect(stack[1].meta.layerId).toBe('layer1')
    expect(stack[0].overrides?.[0].meta?.layerId).toBe('layer1')
  })
})

describe('target.md - 文件路由扫描测试 (pages)', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'target')
  const pagesConfig: Record<string, ResourceScanConfig> = {
    pages: { enabled: true, name: 'pages', pattern: ['**/*.vue'], ignore: [] },
  }

  it('应按 key 与 route 扫描 pages', async () => {
    const layer1: LayerDef = {
      id: 'layer1',
      source: { type: 'local', root: join(fixturesDir, 'layer1'), dynamic: false },
      priority: 50,
    }
    const layer2: LayerDef = {
      id: 'layer2',
      source: { type: 'local', root: join(fixturesDir, 'layer2'), dynamic: false },
      priority: 100,
    }

    const assets1 = await scanLayer(layer1, pagesConfig)
    const assets2 = await scanLayer(layer2, pagesConfig)

    expect(assets1.map(asset => asset.key).sort()).toEqual(['pages/a', 'pages/b', 'pages/d/[id]'])
    expect(assets2.map(asset => asset.key).sort()).toEqual(['pages/b', 'pages/c'])

    const dynamicPage = assets1.find(asset => asset.key === 'pages/d/[id]')
    expect(dynamicPage?.meta.routePath).toBe('/d/:id')
  })

  it('pages/b 应由高优先级层覆盖，且保留覆盖链', async () => {
    const layer1: LayerDef = {
      id: 'layer1',
      source: { type: 'local', root: join(fixturesDir, 'layer1'), dynamic: false },
      priority: 50,
    }
    const layer2: LayerDef = {
      id: 'layer2',
      source: { type: 'local', root: join(fixturesDir, 'layer2'), dynamic: false },
      priority: 100,
    }

    const assets1 = await scanLayer(layer1, pagesConfig)
    const assets2 = await scanLayer(layer2, pagesConfig)
    const ovfs = createOVFS()
    ovfs.addMany([...assets1, ...assets2])

    const resolved = ovfs.resolve('pages/b')
    expect(resolved?.meta.layerId).toBe('layer2')

    const stack = ovfs.resolveAll('pages/b')
    expect(stack).toHaveLength(2)
    expect(stack[0].meta.layerId).toBe('layer2')
    expect(stack[1].meta.layerId).toBe('layer1')
    expect(stack[0].overrides?.length).toBe(1)
  })
})

describe('target.md - 堆结构管理层测试', () => {
  it('层应该按优先级排序（高优先级在前）', () => {
    const registry = createLayerRegistry()

    const layerLow: LayerDef = { id: 'low', source: { type: 'local', root: '/low' }, priority: 10 }
    const layerMid: LayerDef = { id: 'mid', source: { type: 'local', root: '/mid' }, priority: 50 }
    const layerHigh: LayerDef = { id: 'high', source: { type: 'local', root: '/high' }, priority: 100 }

    registry.register(layerLow)
    registry.register(layerMid)
    registry.register(layerHigh)

    const ordered = registry.getOrdered()
    expect(ordered[0].id).toBe('high')
    expect(ordered[1].id).toBe('mid')
    expect(ordered[2].id).toBe('low')
  })

  it('同优先级应按注册顺序排序', () => {
    const registry = createLayerRegistry()
    const layerA: LayerDef = { id: 'a', source: { type: 'local', root: '/a' }, priority: 100 }
    const layerB: LayerDef = { id: 'b', source: { type: 'local', root: '/b' }, priority: 100 }
    const layerC: LayerDef = { id: 'c', source: { type: 'local', root: '/c' }, priority: 100 }

    registry.register(layerA)
    registry.register(layerB)
    registry.register(layerC)

    expect(registry.getOrdered().map(layer => layer.id)).toEqual(['a', 'b', 'c'])
  })

  it('pipeline 层启动顺序应与 registry 保持一致', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const pipeline = createPipeline({ rootDir: fixturesDir })

    const layerConfig: LayerConfig = {
      enabled: true,
      defs: [
        { id: 'a', source: { type: 'local', root: './layer1', dynamic: false }, priority: 100 },
        { id: 'b', source: { type: 'local', root: './layer2', dynamic: false }, priority: 100 },
        { id: 'c', source: { type: 'local', root: './layer1', dynamic: false }, priority: 100 },
      ],
      config: {
        plugins: {
          enabled: true,
          name: 'plugins',
          pattern: ['**/*.{ts,js}'],
          ignore: [],
        },
      },
    }

    const result = await pipeline.run(layerConfig)
    const orderedByRegistry = result.registry.getOrdered().map(layer => layer.id)
    const startedOrder = result.layers.map(layer => layer.def.id)
    expect(startedOrder).toEqual(orderedByRegistry)
    expect(startedOrder).toEqual(['a', 'b', 'c'])
  })

  it('pipeline 应复用传入的 ovfs 实例', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const injectedOVFS = createOVFS()
    const pipeline = createPipeline({
      rootDir: fixturesDir,
      ovfs: injectedOVFS,
    })

    const layerConfig: LayerConfig = {
      enabled: true,
      defs: [
        { id: 'layer1', source: { type: 'local', root: './layer1', dynamic: false }, priority: 100 },
      ],
      config: {
        plugins: {
          enabled: true,
          name: 'plugins',
          pattern: ['**/*.{ts,js}'],
          ignore: [],
        },
      },
    }

    const result = await pipeline.run(layerConfig)
    expect(result.ovfs).toBe(injectedOVFS)
    expect(injectedOVFS.resolve('plugins/a')).toBeTruthy()
  })
})

describe('target.md - OVFS 资源管理测试', () => {
  it('同 key 高优先级资源应该覆盖低优先级资源', () => {
    const ovfs = createOVFS()

    const layer1: LayerDef = { id: 'base', source: { type: 'local', root: '/base' }, priority: 10 }
    const layer2: LayerDef = { id: 'user', source: { type: 'local', root: '/user' }, priority: 100 }

    ovfs.upsert(createAsset('components/Button.vue', layer1, 'components', 'components'))
    ovfs.upsert(createAsset('components/Button.vue', layer2, 'components', 'components'))

    const resolved = ovfs.resolve('components/Button')
    expect(resolved?.meta.layerId).toBe('user')
    expect(resolved?.overrides?.[0].meta?.layerId).toBe('base')
  })
})

describe('target.md - 动态层最小变更测试', () => {
  it('应支持 add/change/unlink 的增量更新与 winner 回退', () => {
    const ovfs = createOVFS()
    const lowLayer: LayerDef = { id: 'low', source: { type: 'local', root: '/low' }, priority: 10 }
    const highLayer: LayerDef = { id: 'high', source: { type: 'local', root: '/high' }, priority: 100 }

    const lowButton = createAsset('components/Button.vue', lowLayer, 'components', 'components')
    ovfs.addMany([lowButton])

    const highButton = createAsset('components/Button.vue', highLayer, 'components', 'components')
    ovfs.upsert(highButton)
    expect(ovfs.resolve('components/Button')?.meta.layerId).toBe('high')

    const changedHighButton = {
      ...highButton,
      loader: {
        ...highButton.loader,
        dynamicImport: () => `import('${highButton.path.relative}?v=2')`,
      },
    }
    ovfs.upsert(changedHighButton)
    expect(ovfs.resolve('components/Button')?.id).toBe(changedHighButton.id)

    const highNew = createAsset('components/New.vue', highLayer, 'components', 'components')
    ovfs.upsert(highNew)
    expect(ovfs.resolve('components/New')?.meta.layerId).toBe('high')

    ovfs.removeById(highButton.id)
    expect(ovfs.resolve('components/Button')?.meta.layerId).toBe('low')

    ovfs.removeById(highNew.id)
    expect(ovfs.resolve('components/New')).toBeUndefined()
  })
})

describe('target.md - remote 占位测试', () => {
  it('cache 命中时应扫描 remote layer', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'remote')
    const pipeline = createPipeline({ rootDir: fixturesDir })

    const layerConfig: LayerConfig = {
      enabled: true,
      defs: [
        {
          id: 'remote-core',
          source: { type: 'remote', root: '@scope/core' },
          priority: 50,
        },
      ],
      remote: {
        cacheDir: '.vona/layers',
        preferCache: true,
      },
      config: {
        plugins: {
          enabled: true,
          name: 'plugins',
          pattern: ['**/*.{ts,js}'],
          ignore: [],
        },
      },
    }

    const result = await pipeline.run(layerConfig)
    expect(result.ovfs.resolve('plugins/remote')).toBeTruthy()
  })

  it('cache 缺失时应跳过 remote layer 且告警', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const pipeline = createPipeline({ rootDir: fixturesDir })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const layerConfig: LayerConfig = {
      enabled: true,
      defs: [
        {
          id: 'remote-missing',
          source: { type: 'remote', root: '@scope/missing' },
          priority: 50,
        },
      ],
      remote: {
        cacheDir: '.vona/layers',
        preferCache: true,
      },
      config: {
        plugins: {
          enabled: true,
          name: 'plugins',
          pattern: ['**/*.{ts,js}'],
          ignore: [],
        },
      },
    }

    const result = await pipeline.run(layerConfig)
    expect(result.ovfs.getByType('plugins')).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})
