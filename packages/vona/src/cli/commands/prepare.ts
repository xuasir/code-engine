import { defineCommand } from 'citty'
import { loadVona } from '../../core'

export default defineCommand({
  meta: {
    name: 'prepare',
    description: 'Prepare .vona for development/build',
  },
  args: {
    mode: {
      type: 'string',
      description: 'Run in specific mode',
      default: 'development',
    },
  },
  async run(ctx) {
    loadVona({
      mode: ctx.args.mode,
      command: {
        name: 'prepare',
        args: ctx.args,
      },
    }).catch((err: any) => {
      // 处理错误
      console.error(`Vona prepare command throw a error: ${err.message}`)
    })
  },
})
