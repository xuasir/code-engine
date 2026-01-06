import type { CodeEngineLayerDefinition } from '@a-sir/code-engine-schema'
import { useCodeEngine } from './context'

export function addLayer(layer: CodeEngineLayerDefinition): void {
  const ce = useCodeEngine()
  ce.hook('layer:extend', async () => {
    ce.options._layers.push(layer)
  })
}
