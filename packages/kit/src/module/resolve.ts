import type { ModuleOptions, Vona, VonaModule } from '@vona-js/schema'
import { pathToFileURL } from 'node:url'
import { resolveModulePath } from 'exsolve'

/**
 * 异步解析 Vona 模块
 * @param vona Vona 实例
 * @returns 解析后的模块映射和路径集合
 */
export async function resolveModules(vona: Vona): Promise<{
  modules: Map<string | VonaModule, Record<string, any>>
  paths: Set<string>
}> {
  // 初始化模块映射、路径集合和已解析模块路径集合
  const modules = new Map<string | VonaModule, Record<string, any>>()
  const paths = new Set<string>()
  const resolvedModulePaths = new Set<string>()

  // 定义模块名称的正则表达式，用于匹配以 '@vona-js/module-' 或者 'vona-js-module-' 开头的模块
  const moduleReg = /^@vona-js\/module-|^vona-js-module-/
  // 添加内部模块
  const internalModules = vona.options.__internalModules
  // 获取配置中的模块列表
  const configModules = vona.options.modules
  // 从依赖项中筛选出符合模块名称规则的模块
  const depsModules = vona.__dependencies?.values().toArray().filter(dep => moduleReg.test(dep)) || []
  // 合并配置中的模块和依赖项中的模块
  const allModules = new Set([...internalModules, ...configModules, ...depsModules])

  // 遍历所有模块，解析并添加到模块映射中
  for (const module of allModules) {
    const resolvedModule = resolveModule(module, vona)
    // 如果模块解析成功，并且该模块路径尚未被解析过
    if (resolvedModule && (!resolvedModule.resolvedPath || !resolvedModulePaths.has(resolvedModule.resolvedPath))) {
      // 将解析后的模块添加到模块映射中
      modules.set(resolvedModule.module, resolvedModule.options)
      // 获取模块的解析路径或模块名称
      const path = resolvedModule.resolvedPath || resolvedModule.module
      // 如果路径是字符串类型，则将其添加到已解析模块路径集合中
      if (typeof path === 'string') {
        resolvedModulePaths.add(path)
      }
    }
  }

  // 返回解析后的模块映射和路径集合
  return {
    modules,
    paths,
  }
}

/**
 * 解析单个模块
 * @param mod 模块或模块数组
 * @param vona Vona 实例
 * @returns 解析后的模块信息
 */
function resolveModule(mod: VonaModule | string | [VonaModule, ModuleOptions] | [string, ModuleOptions], vona: Vona): {
  module: VonaModule | string
  resolvedPath?: string
  options: ModuleOptions
} {
  // 如果模块是数组，则解构出模块和选项，否则将模块作为第一个元素，选项为空对象
  const [module, options = {}] = Array.isArray(mod) ? mod : [mod, {}]

  // 如果模块不是字符串类型，则直接返回模块和选项
  if (typeof module !== 'string') {
    return {
      module,
      options,
    }
  }

  // 使用 resolveModulePath 解析模块路径
  const modulePath = resolveModulePath(module, {
    try: true, // 尝试解析模块路径
    from: pathToFileURL(vona.options.__rootDir), // 从 Vona 的根目录开始解析
    suffixes: ['', 'index', 'module', 'module/index'], // 模块路径的后缀
    extensions: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'], // 模块文件的扩展名
  })

  // 返回解析后的模块信息
  return {
    module,
    resolvedPath: modulePath,
    options,
  }
}
