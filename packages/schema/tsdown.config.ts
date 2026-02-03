import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  outDir: 'dist',
  clean: true,
  dts: true,
  outExtensions: () => ({
    js: '.mjs',
    dts: '.d.mts',
  }),
})
