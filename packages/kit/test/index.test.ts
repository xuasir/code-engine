import { describe, expect, it } from 'vitest'
import * as kit from '../src'
import * as internal from '../src/internal'

describe('kit exports', () => {
  it('根入口仅暴露 module API', () => {
    expect(kit.defineModule).toBeTypeOf('function')
    expect(kit.addLayer).toBeTypeOf('function')
    expect(kit.addLayers).toBeTypeOf('function')
    expect(kit.extendConfigSchema).toBeTypeOf('function')
    expect(kit.useLogger).toBeTypeOf('function')
    expect(kit.useVona).toBeTypeOf('function')
    expect(kit.tryUseVona).toBeTypeOf('function')

    expect((kit as any).setVonaCtx).toBeUndefined()
    expect((kit as any).runWithVonaContext).toBeUndefined()
    expect((kit as any).createLayerRuntime).toBeUndefined()
    expect((kit as any).createOVFS).toBeUndefined()
  })

  it('internal 子路径暴露内核 API', () => {
    expect(internal.setVonaCtx).toBeTypeOf('function')
    expect(internal.runWithVonaContext).toBeTypeOf('function')
    expect(internal.createLayerRuntime).toBeTypeOf('function')
    expect(internal.createOVFS).toBeTypeOf('function')
  })
})
