export enum VonaMode {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}
export interface VonaEnv {
  mode: VonaMode
  dev: boolean
  prod: boolean
  test: boolean
  /** 获取指定环境变量 */
  get: (key: string) => string | undefined
  /** 获取所有以 prefix 开头的环境变量 */
  getAll: () => Record<string, string>
}
