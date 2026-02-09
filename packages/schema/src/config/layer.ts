import { LayerStandardResourceConfig } from '../types/layer'
import { defineResolvers } from '../utils/def'

export default defineResolvers({
  layer: {
    enabled: true,
    defs: [],
    remote: {
      cacheDir: '.vona/layers',
      preferCache: true,
    },
    config: LayerStandardResourceConfig,
  },
})
