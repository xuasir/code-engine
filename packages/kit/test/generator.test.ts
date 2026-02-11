import type { Vona, VonaHooks } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHooks } from 'hookable'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createArtifactsBuilder, SlotPresets } from '../src'
import {
  clearArtifactsRegistry,
  createArtifactsRuntime,
  createEnv,
  createLayerRegistry,
  createOVFS,
  runWithVonaContext,
  snapshotArtifactsRegistry,
} from '../src/internal'

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

async function waitFor(predicate: () => boolean, timeoutMs: number = 800): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timeout')
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

describe('artifacts runtime (host-centric)', () => {
  it('enforces host mode state machine', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        const builder = createArtifactsBuilder({
          owner: 'module-a',
          vona,
        })

        const host = builder.host('generated/state.ts')
        const textHost = host.text().content('export const A = 1').end()

        expect(() => (textHost as any).slots()).toThrow('mode already set')
        textHost.end()
      })
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('supports slots + SlotPresets + explain', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        const builder = createArtifactsBuilder({ owner: 'module-a', vona })

        builder.host('generated/entry.ts')
          .ts()
          .slots()
          .template('/* @vona:slot imports */\n/* @vona:slot body */\n')
          .slot('imports')
          .preset(SlotPresets.imports())
          .inputFrom('imports', { inputId: 'imports->imports' })
          .map(item => ({
            kind: 'import',
            data: item,
            from: { module: 'module-a' },
            key: `imp:${(item as any).from}`,
          }))
          .end()
          .end()
          .slot('body')
          .preset(SlotPresets.snippet())
          .inputFrom('snippet', { inputId: 'snippet->body' })
          .map(item => ({
            kind: 'snippet',
            data: item,
            from: { module: 'module-a' },
            key: `snip:${(item as any).code}`,
          }))
          .end()
          .end()
          .end()
          .ir()
          .push('imports', { type: 'named', from: 'vue', names: ['ref'] })
          .push('snippet', { lang: 'ts', code: 'export const value = ref(1)' })
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'memory',
        registry: () => snapshotArtifactsRegistry(vona),
      })

      const commit = await runtime.commit()
      expect(commit.emitted.length).toBe(1)

      const memory = runtime.memoryEntries().find(item => item.path === 'generated/entry.ts')
      expect(memory?.content).toContain(`import { ref } from 'vue'`)
      expect(memory?.content).toContain('export const value = ref(1)')

      const explain = await runtime.explain('generated/entry.ts')
      expect(explain.slots?.find(item => item.slot === 'imports')?.items[0]?.inputId).toBe('imports->imports')
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('throws when slot accepts mismatch', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        const builder = createArtifactsBuilder({ owner: 'module-a', vona })
        builder.host('generated/bad.ts')
          .slots()
          .template('/* @vona:slot imports */\n')
          .slot('imports')
          .preset(SlotPresets.imports())
          .inputFrom('snippet')
          .map(item => ({
            kind: 'snippet',
            data: item,
            from: { module: 'module-a' },
            key: 'bad-key',
          }))
          .end()
          .end()
          .end()
          .ir()
          .push('snippet', { lang: 'ts', code: 'export const bad = 1' })
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'memory',
        registry: () => snapshotArtifactsRegistry(vona),
      })

      await expect(runtime.commit()).rejects.toThrow('does not accept payload')
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('throws on missing marker and duplicated marker', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        const builder = createArtifactsBuilder({ owner: 'module-a', vona })
        builder.host('generated/missing.ts')
          .slots()
          .template('export const x = 1\n')
          .usePreset('body', SlotPresets.snippet())
          .add('body', {
            kind: 'snippet',
            data: { lang: 'ts', code: 'export const y = 2' },
            from: { module: 'module-a' },
            key: 'body',
          })
          .end()
          .end()

        builder.host('generated/multi.ts')
          .slots()
          .template('/* @vona:slot body */\n/* @vona:slot body */\n')
          .usePreset('body', SlotPresets.snippet())
          .add('body', {
            kind: 'snippet',
            data: { lang: 'ts', code: 'export const z = 3' },
            from: { module: 'module-a' },
            key: 'body',
          })
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'memory',
        registry: () => snapshotArtifactsRegistry(vona),
      })

      await expect(runtime.commit()).rejects.toThrow('marker not found')
      clearArtifactsRegistry(vona)

      await runWithVonaContext(vona, async () => {
        const builder = createArtifactsBuilder({ owner: 'module-a', vona })
        builder.host('generated/multi.ts')
          .slots()
          .template('/* @vona:slot body */\n/* @vona:slot body */\n')
          .usePreset('body', SlotPresets.snippet())
          .add('body', {
            kind: 'snippet',
            data: { lang: 'ts', code: 'export const z = 3' },
            from: { module: 'module-a' },
            key: 'body',
          })
          .end()
          .end()
      })

      const runtime2 = createArtifactsRuntime({
        outputDir,
        mode: 'memory',
        registry: () => snapshotArtifactsRegistry(vona),
      })
      await expect(runtime2.commit()).rejects.toThrow('appears more than once')
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('supports copyFile transform with bytes', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const fixtureFile = join(process.cwd(), 'packages/kit/test/fixtures/generator/static.txt')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        createArtifactsBuilder({ owner: 'module-a', vona })
          .host('generated/copied.txt')
          .copyFile()
          .from(fixtureFile)
          .transform(input => Buffer.from(Buffer.from(input).toString('utf8').toUpperCase(), 'utf8'))
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        registry: () => snapshotArtifactsRegistry(vona),
      })
      await runtime.commit()

      const content = await readFile(join(outputDir, 'generated/copied.txt'), 'utf8')
      expect(content).toContain('STATIC')
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('supports copyDir filter/ignore/mapPath', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const fixtureDir = join(process.cwd(), 'packages/kit/test/fixtures/generator/copy-dir')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        createArtifactsBuilder({ owner: 'module-a', vona })
          .host('generated/assets')
          .copyDir()
          .from(fixtureDir)
          .filter('**/*.txt')
          .ignore('**/skip.txt')
          .mapPath(path => `x/${path}`)
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        registry: () => snapshotArtifactsRegistry(vona),
      })
      await runtime.commit()

      expect(await readFile(join(outputDir, 'generated/assets/x/a.txt'), 'utf8')).toContain('copy-a')
      expect(await readFile(join(outputDir, 'generated/assets/x/nested/b.txt'), 'utf8')).toContain('copy-b')
      expect(existsSync(join(outputDir, 'generated/assets/x/skip.txt'))).toBe(false)
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('supports plan/commit/diff', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        createArtifactsBuilder({ owner: 'module-a', vona })
          .host('generated/plan.ts')
          .text()
          .content('export const PLAN = true')
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        registry: () => snapshotArtifactsRegistry(vona),
      })

      const firstPlan = await runtime.plan()
      expect(firstPlan.hosts.some(item => item.path === 'generated/plan.ts' && item.changed)).toBe(true)

      const firstCommit = await runtime.commit()
      expect(firstCommit.emitted.some(item => item.path === 'generated/plan.ts')).toBe(true)

      const secondPlan = await runtime.plan()
      expect(secondPlan.hosts.some(item => item.path === 'generated/plan.ts' && !item.changed)).toBe(true)

      const diff = await runtime.diff()
      expect(diff.files.find(item => item.path === 'generated/plan.ts')?.summary).toBe('unchanged')
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('watch invalidation propagates to downstream host via toHost edge', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)
    let emitTick: ((reason: string) => void) | undefined
    let runA = 0
    let runB = 0

    try {
      await runWithVonaContext(vona, async () => {
        const builder = createArtifactsBuilder({ owner: 'module-a', vona })

        builder.host('generated/source.txt')
          .watchBy('tick', (emit) => {
            emitTick = (reason: string) => emit.emit(reason)
            return () => {}
          })
          .text()
          .content(() => `A:${++runA}`)
          .end()
          .ir()
          .toHost('generated/target.txt')
          .push('noop', { from: 'source' })
          .end()
          .end()

        builder.host('generated/target.txt')
          .text()
          .content(() => `B:${++runB}`)
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        debounceMs: 0,
        registry: () => snapshotArtifactsRegistry(vona),
      })

      await runtime.start()
      expect(runA).toBe(1)
      expect(runB).toBe(1)

      const targetPath = join(outputDir, 'generated/target.txt')
      const before = (await stat(targetPath)).mtimeMs

      emitTick?.('tick')
      await waitFor(() => runB >= 2)

      const after = (await stat(targetPath)).mtimeMs
      expect(after).toBeGreaterThan(before)

      await runtime.close()
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('clean removes managed files only', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const outputDir = join(rootDir, '.vona')
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        createArtifactsBuilder({ owner: 'module-a', vona })
          .host('generated/clean.txt')
          .text()
          .content('clean me')
          .end()
          .end()
      })

      const runtime = createArtifactsRuntime({
        outputDir,
        mode: 'disk',
        clean: true,
        registry: () => snapshotArtifactsRegistry(vona),
      })

      await runtime.commit()
      await writeFile(join(outputDir, 'manual.txt'), 'manual\n', 'utf8')

      clearArtifactsRegistry(vona)
      await runtime.run({ event: { source: 'manual', kind: 'manual' } })

      expect(existsSync(join(outputDir, 'generated/clean.txt'))).toBe(false)
      expect(existsSync(join(outputDir, 'manual.txt'))).toBe(true)
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('protects reserved core hosts from external builders', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        createArtifactsBuilder({ owner: '__vona_internal__:core:generate:debug', vona })
          .host('generated/debug.json')
          .text()
          .content('{"core":true}')
          .end()
          .end()

        expect(() => {
          createArtifactsBuilder({ owner: 'module-a', vona })
            .host('generated/debug.json')
            .text()
            .content('{"core":false}')
            .end()
            .end()
        }).toThrow('reserved by core owner')
      })
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })

  it('keeps typed host file paths via generic options', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'vona-artifacts-'))
    const vona = createMockVona(rootDir)

    try {
      await runWithVonaContext(vona, async () => {
        const filePathScope = ['types.d.ts', 'manifest.json'] as const
        const builder = createArtifactsBuilder({
          owner: 'module-a',
          filePathScope,
          vona,
        })
        const genericBuilder = createArtifactsBuilder<typeof filePathScope>({
          owner: 'module-a',
          filePathScope,
          vona,
        })

        expectTypeOf(builder.host).parameter(0).toEqualTypeOf<'types.d.ts' | 'manifest.json'>()
        expectTypeOf(genericBuilder.host).parameter(0).toEqualTypeOf<'types.d.ts' | 'manifest.json'>()
        expect(() => (builder as any).host('other.ts')).toThrow('out of builder.filePathScope')
      })
    }
    finally {
      clearArtifactsRegistry(vona)
    }
  })
})
