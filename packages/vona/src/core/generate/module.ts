import type { Vona } from '@vona-js/schema'
import { debounce, defineModule, generateDTS, useLogger } from '@vona-js/kit'
import { ensureDir, writeFile } from 'fs-extra'
import { join } from 'pathe'

export interface GenerateModuleOptions {
  outputDir?: string
}

export default defineModule({
  meta: {
    name: 'vona:generate',
    version: '0.0.1',
    configKey: 'generate',
  },
  defaults: (): GenerateModuleOptions => ({
    outputDir: '.vona',
  }),
  async setup(options: GenerateModuleOptions, vona: Vona) {
    const logger = useLogger('vona:generate')

    if (vona.options.__command?.name !== 'prepare') {
      logger.debug('prepare command not running')
      return false
    }

    const outputDir = join(vona.options.__rootDir, options.outputDir!)
    await ensureDir(outputDir)
    const dtsPath = join(outputDir, 'types.d.ts')

    const writeTypes = async (): Promise<void> => {
      if (!vona.ovfs) {
        logger.debug('ovfs not ready, skip type generation')
        return
      }
      const dts = generateDTS(vona.ovfs.toManifest())
      await writeFile(dtsPath, dts)
    }

    const writeTypesDebounced = debounce(() => {
      void writeTypes().catch((error) => {
        logger.error(error)
      })
    }, 80)

    await writeTypes()

    vona.hook('layer:loaded', async () => {
      await writeTypes()
    })

    vona.hook('layer:change', () => {
      writeTypesDebounced()
    })

    vona.hook('modules:done', async () => {
      await writeTypes()
    })
  },
})
