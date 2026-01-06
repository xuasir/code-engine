import type { CodeEngineLayer, CodeEngineLayerDefinition, ScanTypeEnum } from '@a-sir/code-engine-schema'
import type { InjectionKey } from './reactive'
import { useCodeEngine } from './context'
import { defineKey } from './reactive'

export function addLayer(layer: CodeEngineLayerDefinition): void {
  const ce = useCodeEngine()
  ce.hook('layer:extend', async () => {
    ce.options.__layers.push(layer)
  })
}

const layerKeyMap = new Map<ScanTypeEnum, InjectionKey<CodeEngineLayer[]>>()

export function getLayerKey(type: ScanTypeEnum): InjectionKey<CodeEngineLayer[]> {
  if (!layerKeyMap.has(type)) {
    layerKeyMap.set(type, defineKey<CodeEngineLayer[]>(`ce-layer-${type}`))
  }
  return layerKeyMap.get(type)!
}

export function useLayer(type: ScanTypeEnum): CodeEngineLayer[] {
  const ce = useCodeEngine()
  return ce.get(getLayerKey(type))!
}
