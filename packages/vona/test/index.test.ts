import type { LayerConfig, Vona, VonaHooks } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { join } from 'node:path'
import { createHooks } from 'hookable'
import { describe, expect, it } from 'vitest'
import { addLayer } from '../../kit/src'
import { closeLayerRegistration, createEnv, createLayerRegistry, createLayerRuntime, createOVFS, runWithVonaContext } from '../../kit/src/internal'

function createMockVona(rootDir: string, layerConfig: LayerConfig): Vona {
  const hooks = createHooks<VonaHooks>()

  const vona = {} as Vona
  Object.assign(vona, {
    __name: 'test-vona',
    __version: '0.0.1',
    __asyncLocalStorageModule: new AsyncLocalStorage<any>(),
    options: {
      debug: false,
      layer: layerConfig,
      __layers: [],
      __rootDir: rootDir,
      __mode: 'development',
      __command: { name: 'dev' },
    } as any,
    hooks,
    hook: hooks.hook.bind(hooks),
    callHook: hooks.callHook.bind(hooks),
    addHooks: hooks.addHooks.bind(hooks),
    ovfs: createOVFS(),
    layerRegistry: createLayerRegistry(),
    env: createEnv(rootDir, 'development' as any),
    ready: async () => {},
    close: async () => {
      await hooks.callHook('close', vona)
    },
    runWithContext: <T extends (...args: any[]) => any>(fn: T) => runWithVonaContext(vona, fn),
  } satisfies Vona)

  return vona
}

describe('layer module + addLayer', () => {
  it('模块 setup 可直接调用 addLayer，modules:done 后应被 runtime 消费', async () => {
    const fixturesDir = join(process.cwd(), 'packages', 'kit', 'test', 'fixtures', 'target')
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

    const vona = createMockVona(fixturesDir, layerConfig)
    const runtime = createLayerRuntime({
      ovfs: vona.ovfs,
    })

    vona.hook('modules:done', async () => {
      vona.options.__layers = vona.layerRegistry.getOrdered()
      await runtime.start(layerConfig, {
        registry: vona.layerRegistry,
      })
    })

    await runWithVonaContext(vona, async () => {
      addLayer(layerConfig.defs[0])
      addLayer({
        id: 'ext',
        source: { type: 'local', root: './layer2', dynamic: false },
        priority: 100,
      })
    })

    closeLayerRegistration(vona)
    await vona.callHook('modules:done')

    expect(vona.ovfs.get('plugins/c')).toBeTruthy()
    expect(vona.ovfs.get('plugins/b')?.meta.layerId).toBe('base')

    await runtime.stop()
  })

  it('modules:done 后 addLayer 应抛错', async () => {
    const fixturesDir = join(process.cwd(), 'packages', 'kit', 'test', 'fixtures', 'target')
    const layerConfig: LayerConfig = {
      enabled: false,
      defs: [],
    }

    const vona = createMockVona(fixturesDir, layerConfig)
    closeLayerRegistration(vona)

    await runWithVonaContext(vona, async () => {
      expect(() => addLayer({
        id: 'late',
        source: { type: 'local', root: './layer1', dynamic: false },
        priority: 100,
      })).toThrow('addLayer can only be used before modules:done')
    })
  })

  it('同优先级下配置层应优先于模块层', async () => {
    const fixturesDir = join(process.cwd(), 'packages', 'kit', 'test', 'fixtures', 'target')
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

    const vona = createMockVona(fixturesDir, layerConfig)
    const runtime = createLayerRuntime({ ovfs: vona.ovfs })

    await runWithVonaContext(vona, async () => {
      addLayer(layerConfig.defs[0])
      addLayer({
        id: 'module-ext',
        source: { type: 'local', root: './layer2', dynamic: false },
        priority: 100,
      })
    })

    closeLayerRegistration(vona)
    await runtime.start(layerConfig, {
      registry: vona.layerRegistry,
    })

    expect(vona.ovfs.get('plugins/b')?.meta.layerId).toBe('base')

    await runtime.stop()
  })
})
