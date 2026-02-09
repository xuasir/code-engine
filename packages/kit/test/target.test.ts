import type { LayerConfig, LayerDef, OVFSMutation, ResourceScanConfig } from '@vona-js/schema'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createPipeline } from '../src/layer/pipeline'
import { createLayerRegistry } from '../src/layer/registry'
import { createAsset, scanLayer } from '../src/layer/scanner'
import { createOVFS } from '../src/ovfs/ovfs'

async function withPipeline<T>(rootDir: string, handler: (pipeline: ReturnType<typeof createPipeline>) => Promise<T>): Promise<T> {
  const pipeline = createPipeline({ rootDir })
  try {
    return await handler(pipeline)
  }
  finally {
    await pipeline.stop()
  }
}

function toUpsertMutations(assets: ReturnType<typeof createAsset>[]): OVFSMutation[] {
  return assets.map(asset => ({ op: 'upsert', asset }))
}

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

  it('layer.enabled=false 仅关闭 src 自动注册，不影响 defs', async () => {
    const semanticFixturesDir = join(__dirname, 'fixtures', 'enabled-semantic')
    const baseConfig = {
      defs: [
        { id: 'core', source: { type: 'local' as const, root: './layer', dynamic: false }, priority: 100 },
      ],
    }

    const disabledIds = await withPipeline(semanticFixturesDir, async (pipeline) => {
      await pipeline.start({
        enabled: false,
        ...baseConfig,
      })
      return pipeline.state().registry.getOrdered().map(layer => layer.id)
    })

    const enabledIds = await withPipeline(semanticFixturesDir, async (pipeline) => {
      await pipeline.start({
        enabled: true,
        ...baseConfig,
      })
      return pipeline.state().registry.getOrdered().map(layer => layer.id)
    })

    expect(disabledIds).toEqual(['core'])
    expect(enabledIds).toEqual(['user', 'core'])
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
    ovfs.mutate(toUpsertMutations([...assets1, ...assets2]), { reason: 'manual' })

    const resolved = ovfs.get('plugins/b')
    expect(resolved?.meta.layerId).toBe('layer2')

    const stack = ovfs.getStack('plugins/b')
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
    ovfs.mutate(toUpsertMutations([...assets1, ...assets2]), { reason: 'manual' })

    const resolved = ovfs.get('pages/b')
    expect(resolved?.meta.layerId).toBe('layer2')

    const stack = ovfs.getStack('pages/b')
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
    await withPipeline(fixturesDir, async (pipeline) => {
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

      await pipeline.start(layerConfig)
      const state = pipeline.state()
      const orderedByRegistry = state.registry.getOrdered().map(layer => layer.id)
      const startedOrder = state.layers.map(layer => layer.def.id)
      expect(startedOrder).toEqual(orderedByRegistry)
      expect(startedOrder).toEqual(['a', 'b', 'c'])
    })
  })

  it('pipeline 应复用传入的 ovfs 实例', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const injectedOVFS = createOVFS()
    const pipeline = createPipeline({
      rootDir: fixturesDir,
      ovfs: injectedOVFS,
    })

    try {
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

      await pipeline.start(layerConfig)
      const state = pipeline.state()
      expect(state.ovfs).toBe(injectedOVFS)
      expect(injectedOVFS.get('plugins/a')).toBeTruthy()
    }
    finally {
      await pipeline.stop()
    }
  })

  it('pipeline 应具备状态机语义，重复 start 抛错，stop 幂等', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const pipeline = createPipeline({ rootDir: fixturesDir })
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

    expect(pipeline.state().status).toBe('idle')
    await pipeline.start(layerConfig)
    expect(pipeline.state().status).toBe('running')
    await expect(pipeline.start(layerConfig)).rejects.toThrow('Pipeline already running')
    await pipeline.stop()
    expect(pipeline.state().status).toBe('stopped')
    await pipeline.stop()
    expect(pipeline.state().status).toBe('stopped')
  })

  it('pipeline.addLayer 在 start 生命周期外调用应抛错', () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const pipeline = createPipeline({ rootDir: fixturesDir })

    expect(() => {
      pipeline.addLayer({
        id: 'out-of-start',
        source: { type: 'local', root: './layer1', dynamic: false },
        priority: 100,
      })
    }).toThrow('addLayer can only be used during pipeline.start')
  })

  it('pipeline.start 应允许 onExtend 注册额外 layer', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    await withPipeline(fixturesDir, async (pipeline) => {
      const layerConfig: LayerConfig = {
        enabled: false,
        defs: [],
        config: {
          plugins: {
            enabled: true,
            name: 'plugins',
            pattern: ['**/*.{ts,js}'],
            ignore: [],
          },
        },
      }

      await pipeline.start(layerConfig, {
        onExtend: (ctx) => {
          ctx.addLayer({
            id: 'ext-layer2',
            source: { type: 'local', root: './layer2', dynamic: false },
            priority: 100,
          })
        },
      })

      expect(pipeline.state().registry.has('ext-layer2')).toBe(true)
      expect(pipeline.state().ovfs.get('plugins/c')).toBeTruthy()
    })
  })

  it('同优先级下配置层应优先于 onExtend 注入层', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    await withPipeline(fixturesDir, async (pipeline) => {
      const layerConfig: LayerConfig = {
        enabled: false,
        defs: [
          { id: 'base', source: { type: 'local', root: './layer1', dynamic: false }, priority: 100 },
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

      await pipeline.start(layerConfig, {
        onExtend: (ctx) => {
          ctx.addLayer({
            id: 'ext',
            source: { type: 'local', root: './layer2', dynamic: false },
            priority: 100,
          })
        },
      })

      expect(pipeline.state().ovfs.get('plugins/b')?.meta.layerId).toBe('base')
    })
  })

  it('onExtend 注入重复 id 时，start 应失败', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    await withPipeline(fixturesDir, async (pipeline) => {
      const layerConfig: LayerConfig = {
        enabled: false,
        defs: [
          { id: 'dup', source: { type: 'local', root: './layer1', dynamic: false }, priority: 100 },
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

      await expect(pipeline.start(layerConfig, {
        onExtend: (ctx) => {
          ctx.addLayer({
            id: 'dup',
            source: { type: 'local', root: './layer2', dynamic: false },
            priority: 100,
          })
        },
      })).rejects.toThrow('Duplicate layer id found: dup')
    })
  })

  it('onExtend 注入 remote 层，缓存缺失时应返回 null 并告警', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let added: LayerDef | null | undefined

    await withPipeline(fixturesDir, async (pipeline) => {
      const layerConfig: LayerConfig = {
        enabled: false,
        defs: [],
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

      await pipeline.start(layerConfig, {
        onExtend: (ctx) => {
          added = ctx.addLayer({
            id: 'remote-missing',
            source: { type: 'remote', root: '@scope/missing' },
            priority: 100,
          })
        },
      })

      expect(added).toBeNull()
      expect(pipeline.state().registry.has('remote-missing')).toBe(false)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    warnSpy.mockRestore()
  })
})

describe('target.md - OVFS 资源管理测试', () => {
  it('同 key 高优先级资源应该覆盖低优先级资源', () => {
    const ovfs = createOVFS()

    const layer1: LayerDef = { id: 'base', source: { type: 'local', root: '/base' }, priority: 10 }
    const layer2: LayerDef = { id: 'user', source: { type: 'local', root: '/user' }, priority: 100 }

    ovfs.mutate(toUpsertMutations([
      createAsset('components/Button.vue', layer1, 'components', 'components'),
      createAsset('components/Button.vue', layer2, 'components', 'components'),
    ]), { reason: 'manual' })

    const resolved = ovfs.get('components/Button')
    expect(resolved?.meta.layerId).toBe('user')
    expect(resolved?.overrides?.[0].meta?.layerId).toBe('base')
  })

  it('ovfs.mutate 应产出 winner 变更事件，支持回退与批量去重', () => {
    const ovfs = createOVFS()
    const changes: Array<{ type: string, path: string, reason: string | undefined }> = []
    const off = ovfs.subscribe((items) => {
      changes.push(...items.map(item => ({ type: item.type, path: item.path, reason: item.reason })))
    })

    const baseLayer: LayerDef = { id: 'base', source: { type: 'local', root: '/base' }, priority: 10 }
    const highLayer: LayerDef = { id: 'high', source: { type: 'local', root: '/high' }, priority: 100 }
    const base = createAsset('components/Button.vue', baseLayer, 'components', 'components')
    const high = createAsset('components/Button.vue', highLayer, 'components', 'components')
    const changedHigh = {
      ...high,
      loader: {
        ...high.loader,
        dynamicImport: () => `import('${high.path.relative}?v=2')`,
      },
    }

    const first = ovfs.mutate([{ op: 'upsert', asset: base }], { reason: 'add' })
    expect(first).toHaveLength(1)
    expect(first[0].type).toBe('add')
    expect(first[0].path).toBe('components/Button')
    expect(first[0].afterStack).toHaveLength(1)

    const second = ovfs.mutate([{ op: 'upsert', asset: high }], { reason: 'change' })
    expect(second).toHaveLength(1)
    expect(second[0].type).toBe('change')
    expect(second[0].beforeStack).toHaveLength(1)
    expect(second[0].afterStack).toHaveLength(2)
    expect(ovfs.get('components/Button')?.meta.layerId).toBe('high')

    const third = ovfs.mutate([{ op: 'upsert', asset: changedHigh }], { reason: 'change' })
    expect(third).toHaveLength(1)
    expect(third[0].type).toBe('change')
    expect(third[0].before?.id).toBe(high.id)
    expect(third[0].after?.id).toBe(high.id)

    const fourth = ovfs.mutate([{ op: 'removeById', id: high.id }], { reason: 'unlink' })
    expect(fourth).toHaveLength(1)
    expect(fourth[0].type).toBe('change')
    expect(ovfs.get('components/Button')?.meta.layerId).toBe('base')

    const fifth = ovfs.mutate([{ op: 'removeById', id: base.id }], { reason: 'unlink' })
    expect(fifth).toHaveLength(1)
    expect(fifth[0].type).toBe('unlink')
    expect(fifth[0].beforeStack).toHaveLength(1)
    expect(fifth[0].afterStack).toHaveLength(0)
    expect(ovfs.get('components/Button')).toBeUndefined()

    const batch = ovfs.mutate(
      [
        { op: 'upsert', asset: base },
        { op: 'upsert', asset: changedHigh },
        { op: 'upsert', asset: high },
      ],
      { reason: 'change' },
    )
    expect(batch).toHaveLength(1)
    expect(batch[0].path).toBe('components/Button')
    expect(batch[0].type).toBe('add')

    ovfs.mutate([{ op: 'removeById', id: high.id }], { reason: 'unlink', silent: true })
    expect(ovfs.get('components/Button')?.meta.layerId).toBe('base')
    expect(changes.some(item => item.reason === 'unlink' && item.type === 'change')).toBe(true)

    off()
    ovfs.mutate([{ op: 'removeById', id: base.id }], { reason: 'unlink' })
    expect(changes.filter(item => item.type === 'unlink').length).toBe(1)
  })
})

describe('target.md - 动态层最小变更测试', () => {
  it('应支持 add/change/unlink 的增量更新与 winner 回退', () => {
    const ovfs = createOVFS()
    const lowLayer: LayerDef = { id: 'low', source: { type: 'local', root: '/low' }, priority: 10 }
    const highLayer: LayerDef = { id: 'high', source: { type: 'local', root: '/high' }, priority: 100 }

    const lowButton = createAsset('components/Button.vue', lowLayer, 'components', 'components')
    ovfs.mutate([{ op: 'upsert', asset: lowButton }], { reason: 'manual' })

    const highButton = createAsset('components/Button.vue', highLayer, 'components', 'components')
    ovfs.mutate([{ op: 'upsert', asset: highButton }], { reason: 'manual' })
    expect(ovfs.get('components/Button')?.meta.layerId).toBe('high')

    const changedHighButton = {
      ...highButton,
      loader: {
        ...highButton.loader,
        dynamicImport: () => `import('${highButton.path.relative}?v=2')`,
      },
    }
    ovfs.mutate([{ op: 'upsert', asset: changedHighButton }], { reason: 'manual' })
    expect(ovfs.get('components/Button')?.id).toBe(changedHighButton.id)

    const highNew = createAsset('components/New.vue', highLayer, 'components', 'components')
    ovfs.mutate([{ op: 'upsert', asset: highNew }], { reason: 'manual' })
    expect(ovfs.get('components/New')?.meta.layerId).toBe('high')

    ovfs.mutate([{ op: 'removeById', id: highButton.id }], { reason: 'manual' })
    expect(ovfs.get('components/Button')?.meta.layerId).toBe('low')

    ovfs.mutate([{ op: 'removeById', id: highNew.id }], { reason: 'manual' })
    expect(ovfs.get('components/New')).toBeUndefined()
  })
})

describe('target.md - remote 占位测试', () => {
  it('cache 命中时应扫描 remote layer', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'remote')
    await withPipeline(fixturesDir, async (pipeline) => {
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

      await pipeline.start(layerConfig)
      expect(pipeline.state().ovfs.get('plugins/remote')).toBeTruthy()
    })
  })

  it('cache 缺失时应跳过 remote layer 且告警', async () => {
    const fixturesDir = join(__dirname, 'fixtures', 'target')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await withPipeline(fixturesDir, async (pipeline) => {
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

      await pipeline.start(layerConfig)
      expect(pipeline.state().ovfs.entries('plugins')).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    warnSpy.mockRestore()
  })
})
