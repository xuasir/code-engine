import { defineResolvers } from '../utils/def'

export default defineResolvers({
  generate: {
    enabled: true,
    outputDir: '.vona',
    mode: 'disk',
    debounceMs: 80,
    clean: false,
    cacheFile: '.cache/generate-state.json',
    writeConcurrency: 8,
    report: {
      enabled: true,
      file: '.cache/generate-report.json',
    },
  },
})
