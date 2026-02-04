import type { CodeEngine } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createContext } from 'unctx'

// 创建一个异步本地存储上下文，用于存储 CodeEngine 实例
const asyncCodeEngineStorage = createContext<CodeEngine>({
  asyncContext: true,
  AsyncLocalStorage,
})

// 设置 CodeEngine 上下文实例
export const setCodeEngineCtx = (ce: CodeEngine): void => asyncCodeEngineStorage.set(ce)

// 获取 CodeEngine 上下文实例，如果不存在则返回 null
export const getCodeEngineCtx = (): CodeEngine | null => asyncCodeEngineStorage.tryUse()

// 使用 CodeEngine 实例，如果实例不存在则抛出错误
export function useCodeEngine(): CodeEngine {
  const instance = asyncCodeEngineStorage.tryUse()
  if (!instance) {
    throw new Error('CodeEngine instance is unavailable!')
  }
  return instance
}

// 尝试使用 CodeEngine 实例，如果不存在则返回 null
export function tryUseCodeEngine(): CodeEngine | null {
  return asyncCodeEngineStorage.tryUse()
}

// 在 CodeEngine 上下文中运行指定函数
export function runWithCodeEngineContext<T extends (...args: any[]) => any>(ce: CodeEngine, fn: T): ReturnType<T> {
  return asyncCodeEngineStorage.call(ce, fn) as ReturnType<T>
}
