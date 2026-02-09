import type { LayerDef, LayerRegistry } from '@vona-js/schema'
import { PriorityHeap } from '@vona-js/utils'

export type { LayerRegistry } from '@vona-js/schema'

export function createLayerRegistry(): LayerRegistry {
  const layers = new Map<string, LayerDef>()
  const order = new Map<string, number>()
  let orderSeed = 0
  const heap = new PriorityHeap((id: string) => {
    const priority = layers.get(id)?.priority ?? 0
    const ordinal = order.get(id) ?? 0
    // 同优先级时，注册顺序越早，排序值越高
    return (priority * 1_000_000) - ordinal
  })

  return {
    register: (def: LayerDef) => {
      const exists = layers.has(def.id)
      layers.set(def.id, def)
      if (!exists) {
        order.set(def.id, orderSeed++)
      }
      if (exists) {
        heap.update(def.id)
      }
      else {
        heap.insert(def.id)
      }
    },
    unregister: (id: string) => {
      if (!layers.has(id))
        return
      layers.delete(id)
      order.delete(id)
      heap.remove(id)
    },
    getOrdered: () => heap.orderedSnapshot().map((id: string) => layers.get(id)!),
    get: (id: string) => layers.get(id),
    has: (id: string) => layers.has(id),
    ids: () => heap.orderedSnapshot(),
  }
}
