import type { Vona } from '@vona-js/schema'
import { defineModule, useLogger } from '@vona-js/kit'
import { createArtifactsRuntime, snapshotArtifactsRegistry } from '@vona-js/kit/internal'
import { isAbsolute, join } from 'pathe'
import { setupDebugBuilder } from './builder/debug'

interface GenerateModuleOptions {
  enabled?: boolean
  outputDir?: string
  mode?: 'disk' | 'memory'
  debounceMs?: number
  clean?: boolean
  cacheFile?: string
  writeConcurrency?: number
  report?: {
    enabled?: boolean
    file?: string
  }
}

function resolveOutputDir(rootDir: string, outputDir: string): string {
  return isAbsolute(outputDir) ? outputDir : join(rootDir, outputDir)
}

export default defineModule({
  meta: {
    name: 'vona:generate',
    version: '0.0.1',
    configKey: 'generate',
  },
  defaults: (): GenerateModuleOptions => ({
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
  }),
  async setup(options: GenerateModuleOptions, vona: Vona) {
    const logger = useLogger('vona:generate')

    if (!options.enabled) {
      logger.debug('generator disabled')
      return false
    }

    if (vona.options.__command?.name !== 'prepare') {
      logger.debug('prepare command not running')
      return false
    }

    if (vona.options.debug) {
      setupDebugBuilder(vona)
    }

    const runtime = createArtifactsRuntime({
      outputDir: resolveOutputDir(vona.options.__rootDir, options.outputDir!),
      mode: options.mode,
      clean: options.clean,
      cacheFile: options.cacheFile,
      debounceMs: options.debounceMs,
      writeConcurrency: options.writeConcurrency,
      report: {
        enabled: options.report?.enabled !== false,
        file: options.report?.file || '.cache/generate-report.json',
      },
      registry: () => snapshotArtifactsRegistry(vona),
      logger,
    })
    await runtime.start()

    vona.hook('close', async () => {
      await runtime.close()
    })
  },
})
