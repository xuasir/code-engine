import cac from 'cac'
import { version } from '../package.json'
import { loadCodeEngine } from './core'

const cli = cac('@a-sir/code-engine')

// cli.command('init', '初始化项目').action(() => {
//   console.log('init')
// })

cli.command('generate', '生成项目').action(() => {
  loadCodeEngine({
    command: {
      name: 'generate',
      args: {},
    },
  }).catch((err: any) => {
    // 处理错误
    console.error(`CodeEngine generate command throw a error: ${err.message}`)
  })
})

// cli.command('use', '使用插件').action(() => {
//   console.log('use')
// })

// cli.command('bff', '启动 BFF').action(() => {
//   console.log('bff')
// })

cli.help().version(version).parse()
