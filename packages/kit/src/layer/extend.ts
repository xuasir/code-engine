import type { LayerDef } from '@vona-js/schema'
import { registerLayer } from './register'

type LayerInput = LayerDef | (() => LayerDef)

function resolveLayerDef(input: LayerInput): LayerDef {
  return typeof input === 'function' ? input() : input
}

export function addLayer(input: LayerInput): void {
  registerLayer(resolveLayerDef(input))
}

export function addLayers(inputs: LayerInput[]): void {
  for (const input of inputs) {
    addLayer(input)
  }
}
