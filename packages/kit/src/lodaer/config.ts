import type { CodeEngineConfig, CodeEngineOptions } from '@a-sir/code-engine-schema'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { loadConfig } from 'c12'
import { resolveModuleURL } from 'exsolve'
import { applyDefaults } from 'untyped'

export interface LoadConfigOptions {
  cwd?: string
}

export async function loadCodeEngineConfig(options: LoadConfigOptions): Promise<CodeEngineOptions> {
  const root = options.cwd || process.cwd()

  const globalSelf = globalThis as any
  globalSelf.defineCodeEngineConfig = (c: any) => c
  const { configFile, config: codeEngineConfig } = await loadConfig<CodeEngineConfig>({
    cwd: root,
    name: 'code-engine',
    configFile: 'code-engine.config',
    rcFile: false,
    globalRc: false,
    dotenv: true,
    extend: { extendKey: ['extends'] },
  })
  delete globalSelf.defineCodeEngineConfig

  // 填充默认字段
  codeEngineConfig.rootDir = root
  codeEngineConfig._configFile = configFile!

  // 加载 schema
  const CodeEngineConfigSchema = await loadSchema(root);

  // 初始化 layers
  (codeEngineConfig as any)._layers = []

  // 附加默认值
  return await applyDefaults(CodeEngineConfigSchema, codeEngineConfig as any) as unknown as CodeEngineOptions
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
