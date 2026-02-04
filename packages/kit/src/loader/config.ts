import type { VonaConfig, VonaMode, VonaOptions } from '@vona-js/schema'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { loadConfig } from 'c12'
import { defu } from 'defu'
import { resolveModuleURL } from 'exsolve'
import { applyDefaults } from 'untyped'

export interface LoadConfigOptions {
  cwd?: string
  mode?: VonaMode | string
}

export async function loadVonaConfig(options: LoadConfigOptions): Promise<VonaOptions> {
  const root = options.cwd || process.cwd()

  const globalSelf = globalThis as any
  globalSelf.defineVonaConfig = (c: any) => c

  // 1. 加载默认配置 vona.config
  const { configFile, config: baseConfig } = await loadConfig<VonaConfig>({
    cwd: root,
    name: 'vona',
    configFile: 'vona.config',
    rcFile: false,
    globalRc: false,
    dotenv: true,
    extend: { extendKey: ['extends'] },
  })

  // 2. 如果指定了 mode，加载 mode 对应的配置 vona.config.development
  let modeConfig: VonaConfig = {}
  if (options.mode) {
    const { config } = await loadConfig<VonaConfig>({
      cwd: root,
      name: 'vona',
      configFile: `vona.config.${options.mode}`,
      rcFile: false,
      globalRc: false,
      dotenv: true,
      extend: { extendKey: ['extends'] },
    })
    modeConfig = config || {}
  }

  delete globalSelf.defineVonaConfig

  // 3. 合并配置
  const vonaConfig = defu(modeConfig, baseConfig) as VonaConfig

  // 填充默认字段
  vonaConfig.__configFile = configFile!

  // 加载 schema
  const VonaConfigSchema = await loadSchema(root);

  // 初始化 layers
  (vonaConfig as any).__layers = []

  // 附加默认值
  const resolvedConfig = await applyDefaults(VonaConfigSchema, vonaConfig as any) as unknown as VonaOptions

  return resolvedConfig
}

async function loadSchema(cwd: string): Promise<any> {
  const url = pathToFileURL(`${cwd}/`)
  const urls: Array<URL | string> = [url]
  const corePath = resolveModuleURL('@vona-js/', { try: true, from: url })
  if (corePath) {
    urls.unshift(corePath)
  }
  const schemaPath = resolveModuleURL('@vona-js/schema', { try: true, from: urls }) ?? '@vona-js/schema'
  return await import(schemaPath).then(r => r.VonaConfigSchema)
}
