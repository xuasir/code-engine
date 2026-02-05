import { defineResolvers } from '../utils/def'

export default defineResolvers({
  layers: {
    enabled: true,
    remote: {
      cacheDir: '.vona/layers',
      preferCache: true,
    },
    plugins: {
      enabled: true,
      name: 'plugins',
    },
    api: {
      enabled: true,
      name: 'apis',
    },
    components: {
      enabled: true,
      name: 'components',
    },
    composables: {
      enabled: true,
      name: 'composables',
    },
    layouts: {
      enabled: true,
      name: 'layouts',
    },
    pages: {
      enabled: true,
      name: 'pages',
    },
    store: {
      enabled: true,
      name: 'store',
    },
    utils: {
      enabled: true,
      name: 'utils',
    },
    icons: {
      enabled: true,
      name: 'icons',
    },
    styles: {
      enabled: true,
      name: 'styles',
    },
  },
})
