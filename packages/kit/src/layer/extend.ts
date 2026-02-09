import type { LayerDef } from '@vona-js/schema'
import { useVona } from '../context'

type LayerInput = LayerDef | (() => LayerDef)

function resolveLayerDef(input: LayerInput): LayerDef {
  return typeof input === 'function' ? input() : input
}

// 在模块安装阶段注册 layer 扩展，pipeline.start 时统一消费。
export function addLayer(input: LayerInput): void {
  const vona = useVona()
  vona.hook('layer:extend', (ctx) => {
    ctx.addLayer(resolveLayerDef(input))
  })
}

export function addLayers(inputs: LayerInput[]): void {
  for (const input of inputs) {
    addLayer(input)
  }
}
