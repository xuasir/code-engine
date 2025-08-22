import { performance } from 'node:perf_hooks'
import { defineModule, useLogger } from '@a-sir/code-engine-kit'

export default defineModule({
  meta: {
    name: 'generate',
    version: '1.0.0',
    configKey: 'generate',
  },
  setup(_resolvedOptions, ce) {
    const logger = useLogger('codeEngine:generate')

    if (ce.options._command?.name !== 'prepare') {
      logger.debug('prepare command not running')
      return false
    }

    ce.hook('modules:done', async () => {
      // 采集所有 vfs 注入
      await ce.callHook('vfs:prepare', ce)
      logger.debug('vfs:prepare done')

      // 写入文件
      const start = performance.now()
      await ce.vfs.root.write(ce.options.rootDir)
      const end = performance.now()
      logger.debug('write files done, cost: %dms', end - start)

      // 执行 generated
      await ce.callHook('vfs:generated', ce)
      logger.debug('vfs:generated done')
    })
  },
})
