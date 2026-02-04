import { useLogger } from '@vona-js/kit'
import { defineCommand } from 'citty'
import { description, version } from '../../package.json'
import commands from './commands'

const logger = useLogger('vona-js:cli')

export const main = defineCommand({
  meta: {
    name: 'vona',
    description,
    version,
  },
  args: {
    command: {
      type: 'positional',
      required: true,
    },
  },
  subCommands: commands,
  setup(ctx) {
    const command = ctx.args._[0]
    logger.debug(`running \`ce ${command}\` command`)
  },
})
