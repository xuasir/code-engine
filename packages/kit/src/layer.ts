import type { ScanTypeEnum, VonaLayer, VonaLayerDefinition } from '@vona-js/schema'
import type { InjectionKey } from './reactive'
import { useVona } from './context'
import { defineKey } from './reactive'

export function addLayer(layer: VonaLayerDefinition): void {
  const ce = useVona()
  ce.hook('layer:extend', async () => {
    ce.options.__layers.push(layer)
  })
}

const layerKeyMap = new Map<ScanTypeEnum, InjectionKey<VonaLayer[]>>()

export function getLayerKey(type: ScanTypeEnum): InjectionKey<VonaLayer[]> {
  if (!layerKeyMap.has(type)) {
    layerKeyMap.set(type, defineKey<VonaLayer[]>(`ce-layer-${type}`))
  }
  return layerKeyMap.get(type)!
}

export function useLayer(type: ScanTypeEnum): VonaLayer[] {
  const ce = useVona()
  return ce.get(getLayerKey(type))!
}
