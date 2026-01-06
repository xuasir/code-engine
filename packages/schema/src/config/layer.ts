import { defineResolvers } from '../utils/def'

export default defineResolvers({
  layers: {
    enabled: true,
    name: 'app',
    api: {
      enabled: true,
      name: 'api',
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
  },
})
