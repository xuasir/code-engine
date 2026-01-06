import type { CodeEngineConfig, CodeEngineMode, CodeEngineOptions } from '@a-sir/code-engine-schema'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { loadConfig } from 'c12'
import { defu } from 'defu'
import { resolveModuleURL } from 'exsolve'
import { applyDefaults } from 'untyped'

export interface LoadConfigOptions {
  cwd?: string
  mode?: CodeEngineMode | string
}

export async function loadCodeEngineConfig(options: LoadConfigOptions): Promise<CodeEngineOptions> {
  const root = options.cwd || process.cwd()

  const globalSelf = globalThis as any
  globalSelf.defineCodeEngineConfig = (c: any) => c

  // 1. 加载默认配置 code-engine.config
  const { configFile, config: baseConfig } = await loadConfig<CodeEngineConfig>({
    cwd: root,
    name: 'code-engine',
    configFile: 'code-engine.config',
    rcFile: false,
    globalRc: false,
    dotenv: true,
    extend: { extendKey: ['extends'] },
  })

  // 2. 如果指定了 mode，加载 mode 对应的配置 code-engine.config.development
  let modeConfig: CodeEngineConfig = {}
  if (options.mode) {
    const { config } = await loadConfig<CodeEngineConfig>({
      cwd: root,
      name: 'code-engine',
      configFile: `code-engine.config.${options.mode}`,
      rcFile: false,
      globalRc: false,
      dotenv: true,
      extend: { extendKey: ['extends'] },
    })
    modeConfig = config || {}
  }

  delete globalSelf.defineCodeEngineConfig

  // 3. 合并配置
  const codeEngineConfig = defu(modeConfig, baseConfig) as CodeEngineConfig

  // 填充默认字段
  codeEngineConfig.__configFile = configFile!

  // 加载 schema
  const CodeEngineConfigSchema = await loadSchema(root);

  // 初始化 layers
  (codeEngineConfig as any).__layers = []

  // 附加默认值
  const resolvedConfig = await applyDefaults(CodeEngineConfigSchema, codeEngineConfig as any) as unknown as CodeEngineOptions

  return resolvedConfig
}

async function loadSchema(cwd: string): Promise<any> {
  const url = pathToFileURL(`${cwd}/`)
  const urls: Array<URL | string> = [url]
  const corePath = resolveModuleURL('@a-sir/code-engine', { try: true, from: url })
  if (corePath) {
    urls.unshift(corePath)
  }
  const schemaPath = resolveModuleURL('@a-sir/code-engine-schema', { try: true, from: urls }) ?? '@a-sir/code-engine-schema'
  return await import(schemaPath).then(r => r.CodeEngineConfigSchema)
}
