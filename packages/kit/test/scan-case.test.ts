import type { LayerDef, ResourceScanConfig } from '@vona-js/schema'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanLayer } from '../src/layer/scanner'

const fixturesDir = join(__dirname, 'fixtures', 'scan-case')

const layer: LayerDef = {
  id: 'scan-case',
  source: {
    type: 'local',
    root: fixturesDir,
    dynamic: false,
  },
  priority: 100,
}

const config: Record<string, ResourceScanConfig> = {
  pages: { enabled: true, name: 'pages', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  components: { enabled: true, name: 'components', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  layouts: { enabled: true, name: 'layouts', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  composables: { enabled: true, name: 'composables', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  apis: { enabled: true, name: 'apis', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  utils: { enabled: true, name: 'utils', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  icons: { enabled: true, name: 'icons', pattern: ['**/*.svg'], ignore: [] },
  styles: { enabled: true, name: 'styles', pattern: ['**/*.{css,scss,less}'], ignore: [] },
  plugins: { enabled: true, name: 'plugins', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  store: { enabled: true, name: 'store', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
}

describe('scan-case.md - 索引到 OVFS 路径映射', () => {
  it('应生成各类型资源路径', async () => {
    const assets = await scanLayer(layer, config)
    const keySet = new Set(assets.map(asset => asset.key))

    expect(keySet).toEqual(new Set([
      'pages/index',
      'pages/user/[id]',
      'pages/[category]/[id]',
      'pages/[[slug]]',
      'pages/[...slug]',
      'pages/(admin)/dashboard',
      'pages/parent/child',
      'pages/users/create',
      'pages/users/[id]',
      'components/Button',
      'components/BaseInput',
      'components/BaseFormSelect',
      'components/UiFeedbackToast',
      'layouts/Basic',
      'layouts/Fullscreen',
      'composables/useCounter',
      'composables/useForm',
      'apis/user',
      'apis/org',
      'utils/formatDate',
      'utils/validateEmail',
      'icons/ArrowRight',
      'icons/ArrowLeft',
      'icons/LogoInput',
      'styles/Global',
      'styles/Var',
      'styles/Common/Input',
      'plugins/Auth',
      'plugins/sso',
      'store/Global',
      'store/User',
    ]))
  })

  it('pages 路由应符合 scan-case 规则', async () => {
    const assets = (await scanLayer(layer, config)).filter(asset => asset.type === 'pages')
    const byKey = new Map(assets.map(asset => [asset.key, asset]))

    expect(byKey.get('pages/index')?.route?.path).toBe('/')
    expect(byKey.get('pages/user/[id]')?.route?.path).toBe('/user/:id')
    expect(byKey.get('pages/[category]/[id]')?.route?.path).toBe('/:category/:id')
    expect(byKey.get('pages/[[slug]]')?.route?.path).toBe('/:slug?')
    expect(byKey.get('pages/[...slug]')?.route?.path).toBe('/:slug(.*)*')
    expect(byKey.get('pages/(admin)/dashboard')?.route?.path).toBe('/dashboard')
    expect(byKey.get('pages/parent/child')?.route?.path).toBe('/parent/child')
  })

  it('静态路由分值应高于动态路由', async () => {
    const assets = (await scanLayer(layer, config)).filter(asset => asset.type === 'pages')
    const byKey = new Map(assets.map(asset => [asset.key, asset]))

    const staticScore = byKey.get('pages/users/create')?.route?.score ?? -1
    const dynamicScore = byKey.get('pages/users/[id]')?.route?.score ?? -1

    expect(staticScore).toBeGreaterThan(dynamicScore)
  })

  it('并行扫描后输出顺序应保持稳定', async () => {
    const baseline = (await scanLayer(layer, config)).map(asset => asset.key)

    for (let i = 0; i < 5; i++) {
      const current = (await scanLayer(layer, config)).map(asset => asset.key)
      expect(current).toEqual(baseline)
    }
  })

  it('flat 类型应过滤超过一层目录的资源', async () => {
    const pluginKeys = (await scanLayer(layer, config))
      .filter(asset => asset.type === 'plugins')
      .map(asset => asset.key)

    expect(pluginKeys).toContain('plugins/Auth')
    expect(pluginKeys).toContain('plugins/sso')
    expect(pluginKeys).not.toContain('plugins/sso/admin')
  })
})
