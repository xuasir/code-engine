import { defineResolvers } from '../utils/def'

export default defineResolvers({
  layer: {
    enabled: true,
    defs: [],
    remote: {
      cacheDir: '.vona/layers',
      preferCache: true,
    },
    config: {
      pages: { enabled: true, name: 'pages', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
      components: { enabled: true, name: 'components', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
      layouts: { enabled: true, name: 'layouts', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
      composables: { enabled: true, name: 'composables', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
      apis: { enabled: true, name: 'apis', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
      icons: { enabled: true, name: 'icons', pattern: ['**/*.svg'], ignore: [] },
      store: { enabled: true, name: 'store', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: ['index.{ts,js}'] },
      utils: { enabled: true, name: 'utils', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
      styles: { enabled: true, name: 'styles', pattern: ['**/*.{css,scss,less}'], ignore: [] },
      plugins: { enabled: true, name: 'plugins', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
    },
  },
})
