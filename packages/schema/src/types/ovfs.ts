/** OVFS 类型定义：用于资源层叠管理与变更事件通知 */
import type { LayerAsset, ResourceManifest } from './asset'
import type { ResourceType } from './layer'

/** 变更原因标识 */
export type OVFSChangeReason = 'hydrate' | 'add' | 'change' | 'unlink' | 'manual'

/** OVFS 变更操作指令 */
export type OVFSMutation
  = | { op: 'upsert', asset: LayerAsset } // 插入或更新资产
    | { op: 'removeById', id: string } // 通过 id 移除资产

/** 资源变更事件（描述一次路径上的差异） */
export interface OVFSResourceChange {
  type: 'add' | 'change' | 'unlink' // 变更类型
  path: string // 资源路径
  resourceType: ResourceType // 资源类型
  before?: LayerAsset // 变更前胜出资产
  after?: LayerAsset // 变更后胜出资产
  beforeStack: LayerAsset[] // 变更前的层叠栈
  afterStack: LayerAsset[] // 变更后的层叠栈
  reason?: OVFSChangeReason // 变更原因
}

/** OVFS 中的条目（某路径的当前状态） */
export interface OVFSEntry {
  path: string // 路径
  type: ResourceType // 类型
  winner: LayerAsset // 当前胜出资产
  stack: LayerAsset[] // 层叠栈
}

/** OVFS 接口：对外的查询、变更与订阅能力 */
export interface OVFS {
  get: (path: string) => LayerAsset | undefined // 获取某路径的胜出资产
  getStack: (path: string) => LayerAsset[] // 获取某路径的层叠栈
  has: (path: string) => boolean // 判断路径是否存在资产
  entries: (type?: ResourceType) => OVFSEntry[] // 枚举条目，按类型可选过滤
  mutate: (
    mutations: OVFSMutation[],
    options?: { silent?: boolean, reason?: OVFSChangeReason },
  ) => OVFSResourceChange[] // 执行变更并返回资源变更列表
  subscribe: (callback: (changes: OVFSResourceChange[]) => void) => () => void // 订阅变更，返回取消订阅函数
  clear: () => void // 清空所有状态
  stats: () => { totalResources: number, byType: Record<ResourceType, number> } // 统计总数与类型分布
  toManifest: () => ResourceManifest // 导出资源清单
}
