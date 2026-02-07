import type { SchemaDefinition } from 'untyped'
import type { VonaMode } from './env'
import type { LayerDef } from './layer'
import type { ModuleMeta, ModuleOptions, ModuleSetupInstallResult, VonaModule } from './module'
import type { ConfigSchema } from './schema'

type DeepPartial<T> = T extends (...args: any[]) => any ? T : T extends Record<string, any> ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export interface VonaConfig extends DeepPartial<ConfigSchema> {
  $schema?: SchemaDefinition
}

export interface VonaOptions extends ConfigSchema {
  __rootDir: string
  __mode: VonaMode
  __command?: {
    name: string
    args: Record<string, any>
  }
  __layers: LayerDef[]
  __internalModules: Array<VonaModule | [VonaModule, ModuleOptions]>
  __requiredModules: Record<string, boolean>
  __installedModules: Array<{
    meta: ModuleMeta
    module: VonaModule
    timings: ModuleSetupInstallResult['timings']
  }>
  $schema?: SchemaDefinition
}
