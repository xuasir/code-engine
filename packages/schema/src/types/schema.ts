import type { GenerateConfig } from './generator'
import type { LayerConfig } from './layer'
import type { ModuleOptions, VonaModule } from './module'

export interface ConfigSchema {
  extends: string
  modules: Array<VonaModule | string | [VonaModule, ModuleOptions] | [string, ModuleOptions]>
  debug: boolean
  layer: LayerConfig
  generate: GenerateConfig
  __configFile: string
}
