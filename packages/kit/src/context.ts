import type { Vona } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createContext } from 'unctx'

// 创建一个异步本地存储上下文，用于存储 Vona 实例
const asyncVonaStorage = createContext<Vona>({
  asyncContext: true,
  AsyncLocalStorage,
})

// 设置 Vona 上下文实例
export const setVonaCtx = (ce: Vona): void => asyncVonaStorage.set(ce)

// 获取 Vona 上下文实例，如果不存在则返回 null
export const getVonaCtx = (): Vona | null => asyncVonaStorage.tryUse()

// 使用 Vona 实例，如果实例不存在则抛出错误
export function useVona(): Vona {
  const instance = asyncVonaStorage.tryUse()
  if (!instance) {
    throw new Error('Vona instance is unavailable!')
  }
  return instance
}

// 尝试使用 Vona 实例，如果不存在则返回 null
export function tryUseVona(): Vona | null {
  return asyncVonaStorage.tryUse()
}

// 在 Vona 上下文中运行指定函数
export function runWithVonaContext<T extends (...args: any[]) => any>(ce: Vona, fn: T): ReturnType<T> {
  return asyncVonaStorage.call(ce, fn) as ReturnType<T>
}
