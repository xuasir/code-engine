import type { CodeEngine, CodeEngineModule, ModuleOptions } from '@a-sir/code-engine-schema'
import { pathToFileURL } from 'node:url'
import { resolveModulePath } from 'exsolve'
import { createJiti } from 'jiti'
import { useCodeEngine } from '../context'

/**
 * 安装 CodeEngine 模块
 * @param mod 模块名称或模块函数
 * @param options 模块选项
 * @param codeEngine CodeEngine 实例，默认使用当前上下文中的 CodeEngine 实例
 */
export async function installModules(mod: string | CodeEngineModule, options: ModuleOptions, codeEngine: CodeEngine = useCodeEngine()): Promise<void> {
  // 加载模块实例
  const moduleInstance = await loadModuleInstance(mod, codeEngine)

  // 在模块的异步本地存储中运行模块实例，并传入选项和 CodeEngine 实例
  const res = await codeEngine.__asyncLocalStorageModule?.run(moduleInstance, () => moduleInstance(options || {}, codeEngine))

  // 如果模块实例返回 false，则终止安装
  if (res === false) {
    return
  }

  // 初始化已安装模块数组（如果不存在）
  codeEngine.options.__installedModules ||= []
  // 将模块信息添加到已安装模块数组中
  codeEngine.options.__installedModules.push({
    meta: await moduleInstance.getMeta?.() || {} as any, // 获取模块元数据
    module: moduleInstance, // 模块实例
    timings: res?.timings, // 模块执行时间
  })
}

/**
 * 加载模块实例
 * @param module 模块名称或模块函数
 * @param codeEngine CodeEngine 实例，默认使用当前上下文中的 CodeEngine 实例
 * @returns 模块实例
 */
async function loadModuleInstance(module: string | CodeEngineModule, codeEngine: CodeEngine = useCodeEngine()): Promise<CodeEngineModule> {
  // 如果模块是函数类型，则直接返回
  if (typeof module === 'function') {
    return module
  }

  // 如果模块不是字符串类型，则抛出类型错误
  if (typeof module !== 'string') {
    throw new TypeError(`CodeEngine Module must be string or function. Received: ${typeof module}`)
  }

  try {
    // 创建 Jiti 实例，用于动态导入模块
    const jiti = createJiti(codeEngine.options.__rootDir)

    // 使用 resolveModulePath 解析模块路径
    const modulePath = resolveModulePath(module, {
      from: pathToFileURL(codeEngine.options.__rootDir), // 从 CodeEngine 的根目录开始解析
      suffixes: ['', 'index', 'module', 'module/index'], // 模块路径的后缀
      extensions: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'], // 模块文件的扩展名
    })

    // 使用 Jiti 导入模块
    const resolvedModule = await jiti.import<CodeEngineModule<any>>(modulePath, { default: true })

    // 如果导入的模块不是函数类型，则抛出类型错误
    if (typeof resolvedModule !== 'function') {
      throw new TypeError(`CodeEngine module should be a function: ${module}.`)
    }

    // 返回导入的模块
    return resolvedModule
  }
  catch (error: unknown) {
    // 处理模块加载错误
    const code = (error as Error & { code?: string }).code
    if (code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || code === 'ERR_UNSUPPORTED_DIR_IMPORT' || code === 'ENOTDIR') {
      throw new TypeError(`Could not load \`${module}\`. Is it installed?`)
    }
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      throw new TypeError(`Error while importing module \`${module}\`: ${error}`)
    }
  }

  // 如果模块加载失败，则抛出类型错误
  throw new TypeError(`Could not load \`${module}\`. Is it installed?`)
}
