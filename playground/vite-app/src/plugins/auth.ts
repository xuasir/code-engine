export interface AuthConfig {
  tokenKey: string
}

export function setupAuth(config: AuthConfig): void {
  const key: string = config.tokenKey
  const hasKey: boolean = typeof key === 'string' && key.length > 0
  if (!hasKey) {
    throw new Error('invalid tokenKey')
  }
}
