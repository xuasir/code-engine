import { defineCommand } from 'citty'
import { loadCodeEngine } from '../../core'

export default defineCommand({
  meta: {
    name: 'prepare',
    description: 'Prepare .code-engine for development/build',
  },
  args: {
    mode: {
      type: 'string',
      description: 'Run in specific mode',
      default: 'development',
    },
  },
  async run(ctx) {
    loadCodeEngine({
      mode: ctx.args.mode,
      command: {
        name: 'prepare',
        args: ctx.args,
      },
    }).catch((err: any) => {
      // 处理错误
      console.error(`CodeEngine prepare command throw a error: ${err.message}`)
    })
  },
})
