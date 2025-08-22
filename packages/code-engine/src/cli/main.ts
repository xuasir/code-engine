import { useLogger } from '@a-sir/code-engine-kit'
import { defineCommand } from 'citty'
import { description, version } from '../../package.json'
import commands from './commands'

const logger = useLogger('code-engine:cli')

export const main = defineCommand({
  meta: {
    name: 'code-engine',
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
    logger.debug(`running \`code-engine ${command}\` command`)
  },
})
