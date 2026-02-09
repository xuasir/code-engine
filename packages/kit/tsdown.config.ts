import { defineConfig } from 'tsdown'

function normalizeExportsMap(input: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = {}

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.endsWith('.mjs')) {
      output[key] = {
        types: value.replace(/\.mjs$/, '.d.mts'),
        import: value,
      }
      continue
    }

    output[key] = value
  }

  return output
}

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/internal.ts',
  ],
  exports: {
    legacy: true,
    packageJson: false,
    customExports(exportsMap) {
      return normalizeExportsMap(exportsMap)
    },
  },
  outDir: 'dist',
  clean: true,
  dts: true,
  outExtensions: () => ({
    js: '.mjs',
    dts: '.d.mts',
  }),
})
