import type { LayerConfig, Vona, VonaHooks } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { join } from 'node:path'
import { createHooks } from 'hookable'
import { describe, expect, it } from 'vitest'
import { addLayer } from '../../kit/src'
import { createEnv, createOVFS, createPipeline, runWithVonaContext } from '../../kit/src/internal'

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
      __rootDir: rootDir,
      __mode: 'development',
      __command: { name: 'dev' },
    } as any,
    hooks,
    hook: hooks.hook.bind(hooks),
    callHook: hooks.callHook.bind(hooks),
    addHooks: hooks.addHooks.bind(hooks),
    ovfs: createOVFS(),
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
  it('模块 setup 可直接调用 addLayer，modules:done 后应被 pipeline 消费', async () => {
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
    const pipeline = createPipeline({
      rootDir: fixturesDir,
      ovfs: vona.ovfs,
    })

    vona.hook('modules:done', async () => {
      await pipeline.start(layerConfig, {
        onExtend: ctx => vona.callHook('layer:extend', ctx),
      })
    })

    await runWithVonaContext(vona, async () => {
      addLayer({
        id: 'ext',
        source: { type: 'local', root: './layer2', dynamic: false },
        priority: 100,
      })
    })

    await vona.callHook('modules:done')

    expect(vona.ovfs.get('plugins/c')).toBeTruthy()
    expect(vona.ovfs.get('plugins/b')?.meta.layerId).toBe('base')

    await pipeline.stop()
  })
})
