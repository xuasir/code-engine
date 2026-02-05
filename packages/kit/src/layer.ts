import type { LayerAsset, LayerDefinition, ScanTypeEnum } from '@vona-js/schema'
import { useVona } from './context'

export function addLayer(layer: LayerDefinition): void {
  const vona = useVona()
  vona.hook('layer:extend', async () => {
    vona.options.__layers.push(layer)
  })
}

const layerStore = new WeakMap<object, Map<ScanTypeEnum, LayerAsset[]>>()

function getStore(): Map<ScanTypeEnum, LayerAsset[]> {
  const vona = useVona() as unknown as object
  let store = layerStore.get(vona)
  if (!store) {
    store = new Map()
    layerStore.set(vona, store)
  }
  return store
}

export function setLayerData(type: ScanTypeEnum, layers: LayerAsset[]): void {
  const store = getStore()
  store.set(type, layers)
}

export function useLayer(type: ScanTypeEnum): LayerAsset[] {
  const store = getStore()
  return store.get(type) || []
}
