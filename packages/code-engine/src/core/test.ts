import { defineModule, useLogger } from '@a-sir/code-engine-kit'

export default defineModule({
  meta: {
    name: 'test',
    version: '1.0.0',
    configKey: 'test',
  },
  setup(resolvedOptions, ce) {
    const logger = useLogger('test:module')
    logger.info('test module setup', resolvedOptions)

    ce.hook('modules:done', () => {
      logger.info('modules:done')
    })
    ce.hook('ready', () => {
      logger.info('ready')
    })
  },
})
