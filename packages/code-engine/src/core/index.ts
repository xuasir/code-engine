import type { CodeEngine, CodeEngineHooks, CodeEngineModule, CodeEngineOptions } from '@a-sir/code-engine-schema'
import type { PackageJson } from 'pkg-types'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createVFS, installModules, loadCodeEngineConfig, resolveModules, runWithCodeEngineContext, setCodeEngineCtx } from '@a-sir/code-engine-kit'
import { createHooks } from 'hookable'
import { readPackageJSON } from 'pkg-types'
import { version } from '../../package.json'
import GenerateModule from './generate/module'

export interface LoadCodeEngineOptions {
  command: CodeEngineOptions['_command']
}

export async function loadCodeEngine(opts: LoadCodeEngineOptions): Promise<CodeEngine> {
  // 加载配置文件
  const options = await loadCodeEngineConfig({ cwd: process.cwd() })

  // 命令
  options._command = opts.command

  // 注入核心模块
  options.__internalModules ||= []
  options.__internalModules.push(GenerateModule)

  // 创建 codeEngine 实例
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
    _version: version,
    _asyncLocalStorageModule: new AsyncLocalStorage<CodeEngineModule>(),
    options,
    hooks,
    hook: hooks.hook,
    callHook: hooks.callHook,
    addHooks: hooks.addHooks,
    vfs: createVFS(),
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
  // 如果是最佳实践模式，初始化对 layer 的监听，触发重新生成

  const packageJSON = await readPackageJSON(codeEngine.options.rootDir).catch(() => ({}) as PackageJson)
  codeEngine._dependencies = new Set([...Object.keys(packageJSON.dependencies || {}), ...Object.keys(packageJSON.devDependencies || {})])

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
