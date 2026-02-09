import type { Vona, VonaHooks, VonaModule, VonaOptions } from '@vona-js/schema'
import type { PackageJson } from 'pkg-types'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createEnv, createOVFS, installModules, loadEnv, loadVonaConfig, resolveModules, runWithVonaContext, setVonaCtx } from '@vona-js/kit/internal'
import { VonaMode } from '@vona-js/schema'
import { createHooks } from 'hookable'
import { readPackageJSON } from 'pkg-types'
import { version } from '../../package.json'
import GenerateModule from './generate/module'
import { LayerModule } from './layer/module'

export interface LoadVonaOptions {
  command: VonaOptions['__command']
  mode?: VonaMode | string
}

export async function loadVona(opts: LoadVonaOptions): Promise<Vona> {
  const root = process.cwd()

  // 1. 确定 mode
  const mode = (opts.mode as VonaMode) || VonaMode.DEVELOPMENT

  // 2. 加载环境变量
  await loadEnv(root, mode)

  // 3. 加载配置文件 (注入 mode)
  const options = await loadVonaConfig({
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
  options.__internalModules.push(LayerModule)
  options.__internalModules.push(GenerateModule)

  // 创建 vona 实例
  const vona = createVona(options)

  // vona ready
  await vona.ready()

  return vona
}

function createVona(options: VonaOptions): Vona {
  // 创建 hook
  const hooks = createHooks<VonaHooks>()

  // 字面对象 创建 Vona 实例
  const vona: Vona = {
    __name: `Vona-${randomUUID()}`,
    __version: version,
    __asyncLocalStorageModule: new AsyncLocalStorage<VonaModule>(),
    options,
    hooks,
    hook: hooks.hook.bind(hooks),
    callHook: hooks.callHook,
    addHooks: hooks.addHooks.bind(hooks),
    ovfs: createOVFS(),
    env: createEnv(options.__rootDir, options.__mode),
    ready: () => runWithVonaContext(vona, () => initVona(vona)),
    close: () => vona.callHook('close', vona),
    runWithContext: fn => runWithVonaContext(vona, fn),
  }

  // hook 执行wrapper函数注入 vona 实例上下文
  const { callHook, callHookParallel, callHookWith } = hooks
  hooks.callHook = (...args) => runWithVonaContext(vona, () => callHook(...args))
  hooks.callHookParallel = (...args) => runWithVonaContext(vona, () => callHookParallel(...args))
  hooks.callHookWith = (...args) => runWithVonaContext(vona, () => callHookWith(...args))
  vona.callHook = hooks.callHook.bind(hooks)

  // 注册上下文
  setVonaCtx(vona)

  // 注册 注销事件
  return vona
}

export async function initVona(vona: Vona): Promise<void> {
  const packageJSON = await readPackageJSON(vona.options.__rootDir).catch(() => ({}) as PackageJson)
  vona.__dependencies = new Set([...Object.keys(packageJSON.dependencies || {}), ...Object.keys(packageJSON.devDependencies || {})])

  // 加载 模块
  await vona.callHook('modules:before')
  const { modules } = await resolveModules(vona)

  // 安装模块
  for (const [mod, options] of modules) {
    await installModules(mod, options)
  }

  await vona.callHook('modules:done')

  // call ready
  vona.callHook('ready', vona)
}
