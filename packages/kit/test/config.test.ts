import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadVonaConfig } from '../src/loader/config'

describe('loadVonaConfig', () => {
  const fixturesDir = join(__dirname, 'fixtures')

  it('should load base config', async () => {
    const cwd = join(fixturesDir, 'basic')
    const config = await loadVonaConfig({ cwd })
    expect(config.debug).toBe(false)
  })

  it('should merge mode config', async () => {
    const cwd = join(fixturesDir, 'basic')
    const config = await loadVonaConfig({ cwd, mode: 'production' })
    expect(config.debug).toBe(true)
  })
})
