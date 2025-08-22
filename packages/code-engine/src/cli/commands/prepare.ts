import { defineCommand } from 'citty'
import { loadCodeEngine } from '../../core'

export default defineCommand({
  meta: {
    name: 'prepare',
    description: 'Prepare .code-engine for development/build',
  },
  args: {},
  async run(_ctx) {
    loadCodeEngine({
      command: {
        name: 'prepare',
        args: {},
      },
    }).catch((err: any) => {
      // 处理错误
      console.error(`CodeEngine prepare command throw a error: ${err.message}`)
    })
  },
})
