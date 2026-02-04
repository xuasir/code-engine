import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { defineModule, useLogger } from '@vona-js/kit'

export default defineModule({
  meta: {
    name: 'generate',
    version: '1.0.0',
    configKey: 'generate',
  },
  setup(_resolvedOptions, ce) {
    const logger = useLogger('vona:generate')

    if (ce.options.__command?.name !== 'prepare') {
      logger.debug('prepare command not running')
      return false
    }

    ce.hook('modules:done', async () => {
      // 采集所有 vfs 注入
      await ce.callHook('vfs:prepare', ce)
      logger.debug('vfs:prepare done')

      // 写入文件
      const start = performance.now()
      await ce.vfs.root.write(path.join(ce.options.__rootDir, '.vona'))
      const end = performance.now()
      logger.debug('write files done, cost: %dms', end - start)

      // 执行 generated
      await ce.callHook('vfs:generated', ce)
      logger.debug('vfs:generated done')
    })
  },
})
