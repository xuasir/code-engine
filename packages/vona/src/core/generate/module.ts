import { defineModule, useLogger } from '@vona-js/kit'

export default defineModule({
  meta: {
    name: 'generate',
    version: '1.0.0',
    configKey: 'generate',
  },
  setup(_resolvedOptions, vona) {
    const logger = useLogger('vona:generate')

    if (vona.options.__command?.name !== 'prepare') {
      logger.debug('prepare command not running')
      return false
    }

    // ce.hook('modules:done', async () => {
    //   // 基于 VFS 完成 Layer 合并与挂载
    //   await ce.callHook('vfs:prepare', ce)
    //   logger.debug('vfs:prepare done')

    //   // 后续资源生成由具体 module 处理
    //   await ce.callHook('vfs:generated', ce)
    //   logger.debug('vfs:generated done')
    // })
  },
})
