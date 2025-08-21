import { resolve } from 'node:path'
import process from 'node:process'
import { defineResolvers } from '../utils/def'

export default defineResolvers({
  extends: undefined,
  rootDir: {
    $resolve: val => typeof val === 'string' ? resolve(val) : process.cwd(),
  },
  modules: [],
  debug: false,

  // internal
  _configFile: undefined,
})
