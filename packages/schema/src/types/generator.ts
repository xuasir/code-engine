export type GenerateMode = 'disk' | 'memory'

export interface GenerateReportConfig {
  enabled: boolean
  file: string
}

export interface GenerateConfig {
  enabled: boolean
  outputDir: string
  mode: GenerateMode
  debounceMs: number
  clean: boolean
  cacheFile: string
  writeConcurrency: number
  report: GenerateReportConfig
}
