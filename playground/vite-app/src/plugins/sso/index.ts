export interface SsoConfig {
  endpoint: string
}

export function setupSso(config: SsoConfig): void {
  const url: string = config.endpoint
  const valid: boolean = /^https?:\/\//.test(url)
  if (!valid) {
    throw new Error('invalid endpoint')
  }
}
