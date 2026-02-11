import type { LayerDef, Vona, VonaHooks } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createArtifactsRuntime,
  createAsset,
  createEnv,
  createLayerRegistry,
  createOVFS,
  runWithVonaContext,
  snapshotArtifactsRegistry,
} from '@vona-js/kit/internal'
import { createHooks } from 'hookable'
import { describe, expect, it } from 'vitest'
import { registerOVFSGenerateAdapterDeclarations } from '../src/core/generate/adapters/ovfs'

function createMockVona(rootDir: string): Vona {
  const hooks = createHooks<VonaHooks>()
  const vona = {
    __name: 'test-vona',
    __version: '0.0.1',
    __asyncLocalStorageModule: new AsyncLocalStorage<any>(),
    options: {
      debug: false,
      layer: {
        enabled: false,
        defs: [],
      },
      generate: {
        enabled: true,
        outputDir: '.vona',
        mode: 'disk',
        debounceMs: 0,
        clean: false,
        cacheFile: '.cache/generate-state.json',
        writeConcurrency: 8,
        report: {
          enabled: true,
          file: '.cache/generate-report.json',
        },
      },
      __layers: [],
      __rootDir: rootDir,
      __mode: 'development',
      __command: { name: 'prepare', args: {} },
    } as any,
    hooks,
    hook: hooks.hook.bind(hooks),
    callHook: hooks.callHook.bind(hooks),
    addHooks: hooks.addHooks.bind(hooks),
    ovfs: createOVFS(),
    layerRegistry: createLayerRegistry(),
    env: createEnv(rootDir, 'development' as any),
    ready: async () => {},
    close: async () => {},
    runWithContext: undefined as any,
  } as unknown as Vona

  vona.runWithContext = fn => runWithVonaContext(vona, fn)
  return vona
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('vona generate ovfs adapter', () => {
  it('types.d.ts rerenders only on related path changes', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-generate-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)
    const layer: LayerDef = {
      id: 'test-layer',
      source: { type: 'local', root: rootDir, dynamic: false },
      priority: 100,
    }

    let runtime: ReturnType<typeof createArtifactsRuntime> | undefined
    try {
      await runWithVonaContext(vona, async () => {
        registerOVFSGenerateAdapterDeclarations(vona)
      })

      runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        debounceMs: 0,
        registry: () => snapshotArtifactsRegistry(vona),
      })
      await runtime.start()

      const typesPath = join(outputDir, 'types.d.ts')
      const firstStat = await stat(typesPath)

      vona.ovfs.mutate([
        { op: 'upsert', asset: createAsset('styles/app.css', layer, 'styles', 'styles') },
      ], { reason: 'change' })
      await sleep(40)
      const secondStat = await stat(typesPath)
      expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs)

      vona.ovfs.mutate([
        { op: 'upsert', asset: createAsset('components/Button.vue', layer, 'components', 'components') },
      ], { reason: 'change' })
      await sleep(40)
      const thirdStat = await stat(typesPath)
      expect(thirdStat.mtimeMs).toBeGreaterThan(secondStat.mtimeMs)

      await runtime.close()
    }
    finally {
      await runtime?.close()
    }
  })

  it('manifest.json rerenders on any ovfs change', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-generate-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)
    const layer: LayerDef = {
      id: 'test-layer',
      source: { type: 'local', root: rootDir, dynamic: false },
      priority: 100,
    }

    let runtime: ReturnType<typeof createArtifactsRuntime> | undefined
    try {
      await runWithVonaContext(vona, async () => {
        registerOVFSGenerateAdapterDeclarations(vona)
      })

      runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        debounceMs: 0,
        registry: () => snapshotArtifactsRegistry(vona),
      })
      await runtime.start()

      const manifestPath = join(outputDir, 'manifest.json')
      const firstStat = await stat(manifestPath)

      vona.ovfs.mutate([
        { op: 'upsert', asset: createAsset('styles/app.css', layer, 'styles', 'styles') },
      ], { reason: 'change' })
      await sleep(40)
      const secondStat = await stat(manifestPath)
      expect(secondStat.mtimeMs).toBeGreaterThan(firstStat.mtimeMs)

      await runtime.close()
    }
    finally {
      await runtime?.close()
    }
  })
})
