export default {
  debug: false,
  layer: {
    enabled: true,
    defs: [
      {
        id: 'user-common',
        source: { type: 'local', root: './src', dynamic: true },
        priority: 100,
      },
    ],
    remote: {
      cacheDir: '.vona/layers',
      preferCache: true,
    },
    config: {
      apis: {
        enabled: true,
        name: 'apis',
        pattern: ['*.{ts,js}'],
        ignore: [],
      },
      components: {
        enabled: true,
        name: 'components',
        pattern: ['**/*.{vue,jsx,tsx}'],
        ignore: [],
      },
      pages: {
        enabled: true,
        name: 'pages',
        pattern: ['**/*.vue'],
        ignore: [],
      },
      plugins: {
        enabled: true,
        name: 'plugins',
        pattern: ['**/*.{ts,js}'],
        ignore: [],
      },
    },
  },
}
