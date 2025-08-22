import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/cli/index',
  ],
  declaration: 'node16',
  clean: true,
})
