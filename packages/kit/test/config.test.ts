import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCodeEngineConfig } from '../src/loader/config'

describe('loadCodeEngineConfig', () => {
  const fixturesDir = join(__dirname, 'fixtures')

  it('should load base config', async () => {
    const cwd = join(fixturesDir, 'basic')
    const config = await loadCodeEngineConfig({ cwd })
    expect(config.debug).toBe(false)
  })

  it('should merge mode config', async () => {
    const cwd = join(fixturesDir, 'basic')
    const config = await loadCodeEngineConfig({ cwd, mode: 'production' })
    expect(config.debug).toBe(true)
  })
})
