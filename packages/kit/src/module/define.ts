import type { CodeEngine, CodeEngineModule, CodeEngineOptions, ModuleDefinition, ModuleOptions, ModuleSetupInstallResult, ModuleSetupReturn } from '@a-sir/code-engine-schema'
import { performance } from 'node:perf_hooks'
import defu from 'defu'
import { applyDefaults } from 'untyped'
import { tryUseCodeEngine, useCodeEngine } from '../context'
import { logger } from '../logger'

// 定义模块函数，用于创建 CodeEngine 模块
export function defineModule<TOptions extends ModuleOptions>(definition: ModuleDefinition<TOptions, Partial<TOptions>>): CodeEngineModule<TOptions> {
  // 如果没有配置键，则使用模块名称作为配置键
  definition.meta.configKey ||= definition.meta.name

  // 获取模块选项的异步函数
  async function getOptions(inlineOptions?: Partial<TOptions>, ce: CodeEngine = useCodeEngine()): Promise<TOptions> {
    const configKey = definition.meta.configKey

    // 从 CodeEngine 选项中获取配置选项
    const configOptions: Partial<TOptions> = configKey && configKey in ce.options ? ce.options[configKey as keyof CodeEngineOptions] as Partial<TOptions> : {}

    // 获取默认选项
    const optionsDefaults
      = typeof definition.defaults === 'function'
        ? await definition.defaults(ce)
        : definition.defaults ?? {}

    // 合并选项
    let options = defu(inlineOptions, configOptions, optionsDefaults)

    // 如果有模式定义，则应用默认值
    if (definition.schema) {
      options = await applyDefaults(definition.schema, options) as any
    }

    return Promise.resolve(options) as any
  }

  // 标准化模块的异步函数
  async function normalizedModule(inlineOptions: Partial<TOptions>, ce: CodeEngine = tryUseCodeEngine()!): Promise<ModuleSetupReturn> {
    // 检查是否在 CodeEngine 上下文中使用模块
    if (!ce) {
      throw new TypeError('Cannot use module outside of CodeEngine context')
    }

    // 获取模块的唯一键
    const uniqueKey = definition.meta.name || definition.meta.configKey
    if (uniqueKey) {
      ce.options.__requiredModules ||= {}
      // 如果模块已加载，则返回 false
      if (ce.options.__requiredModules[uniqueKey]) {
        return false
      }
      // 标记模块已加载
      ce.options.__requiredModules[uniqueKey] = true
    }

    // 获取选项
    const _options = await getOptions(inlineOptions, ce)

    // 添加钩子
    if (definition.hooks) {
      ce.hooks.addHooks(definition.hooks)
    }

    // 记录设置时间
    const start = performance.now()
    const res = await definition.setup?.call(null as any, _options, ce) ?? {}
    const perf = performance.now() - start
    const setupTime = Math.round((perf * 100)) / 100

    // 测量设置时间
    if (setupTime > 5000) {
      logger.warn(`Slow module \`${uniqueKey || '<no name>'}\` took \`${setupTime}ms\` to setup.`)
    }
    // else if (ce.options.debug && ce.options.debug.modules) {
    //   logger.info(`Module \`${uniqueKey || '<no name>'}\` took \`${setupTime}ms\` to setup.`)
    // }

    // 如果返回 false，则返回 false
    if (res === false) {
      return false
    }

    // 返回合并后的结果
    return defu(res, <ModuleSetupInstallResult> {
      timings: {
        setup: setupTime,
      },
    })
  }

  // 获取模块元数据
  normalizedModule.getMeta = () => Promise.resolve(definition.meta)
  // 获取模块选项
  normalizedModule.getOptions = getOptions

  return normalizedModule as any
}
