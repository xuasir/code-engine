import type { CodeEngine, CodeEngineHooks, CodeEngineModule, CodeEngineOptions } from '@a-sir/code-engine-schema'
import type { PackageJson } from 'pkg-types'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createEnv, createVFS, installModules, loadCodeEngineConfig, loadEnv, resolveModules, runWithCodeEngineContext, setCodeEngineCtx } from '@a-sir/code-engine-kit'
import { CodeEngineMode } from '@a-sir/code-engine-schema'
import { createHooks } from 'hookable'
import { readPackageJSON } from 'pkg-types'
import { version } from '../../package.json'
import GenerateModule from './generate/module'

export interface LoadCodeEngineOptions {
  command: CodeEngineOptions['__command']
  mode?: CodeEngineMode | string
}

export async function loadCodeEngine(opts: LoadCodeEngineOptions): Promise<CodeEngine> {
  const root = process.cwd()

  // 1. 确定 mode
  const mode = (opts.mode as CodeEngineMode) || CodeEngineMode.DEVELOPMENT

  // 2. 加载环境变量
  await loadEnv(root, mode)

  // 3. 加载配置文件 (注入 mode)
  const options = await loadCodeEngineConfig({
    cwd: root,
    mode,
  })

  // 根目录
  options.__rootDir = root

  // 模式
  options.__mode = mode

  // 命令
  options.__command = opts.command

  // 注入核心模块
  options.__internalModules ||= []
  options.__internalModules.push(GenerateModule)

  // 创建 codeEngine 实例 (传入 env)
  const codeEngine = createCodeEngine(options)

  // codeEngine ready
  await codeEngine.ready()

  return codeEngine
}

function createCodeEngine(options: CodeEngineOptions): CodeEngine {
  // 创建 hook
  const hooks = createHooks<CodeEngineHooks>()

  // 字面对象 创建 CodeEngine 实例
  const codeEngine: CodeEngine = {
    __name: `CodeEngine-${randomUUID()}`,
    __version: version,
    __asyncLocalStorageModule: new AsyncLocalStorage<CodeEngineModule>(),
    options,
    hooks,
    hook: hooks.hook,
    callHook: hooks.callHook,
    addHooks: hooks.addHooks,
    vfs: createVFS(),
    env: createEnv(options.__rootDir, options.__mode),
    ready: () => runWithCodeEngineContext(codeEngine, () => initCodeEngine(codeEngine)),
    close: () => codeEngine.callHook('close', codeEngine),
    runWithContext: fn => runWithCodeEngineContext(codeEngine, fn),
  }

  // hook 执行wrapper函数注入 codeEngine 实例上下文
  const { callHook, callHookParallel, callHookWith } = hooks
  hooks.callHook = (...args) => runWithCodeEngineContext(codeEngine, () => callHook(...args))
  hooks.callHookParallel = (...args) => runWithCodeEngineContext(codeEngine, () => callHookParallel(...args))
  hooks.callHookWith = (...args) => runWithCodeEngineContext(codeEngine, () => callHookWith(...args))
  codeEngine.callHook = hooks.callHook

  // 注册上下文
  setCodeEngineCtx(codeEngine)

  // 注册 注销事件
  return codeEngine
}

export async function initCodeEngine(codeEngine: CodeEngine): Promise<void> {
  const packageJSON = await readPackageJSON(codeEngine.options.__rootDir).catch(() => ({}) as PackageJson)
  codeEngine.__dependencies = new Set([...Object.keys(packageJSON.dependencies || {}), ...Object.keys(packageJSON.devDependencies || {})])

  // 加载 模块
  await codeEngine.callHook('modules:before')
  const { modules } = await resolveModules(codeEngine)

  // 安装模块
  for (const [mod, options] of modules) {
    await installModules(mod, options)
  }

  await codeEngine.callHook('modules:done')

  // call ready
  codeEngine.callHook('ready', codeEngine)
}
