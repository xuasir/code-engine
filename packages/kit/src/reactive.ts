import type { InjectionKey } from '@vona-js/schema'
import { AsyncLocalStorage } from 'node:async_hooks'
import { useCodeEngine } from './context'

export type { InjectionKey }

// ==========================================
// 1. 标识符 (Identity)
// ==========================================

export function defineKey<T>(description?: string): InjectionKey<T> {
  return Symbol(description) as InjectionKey<T>
}

// ==========================================
// 2. 上下文与追踪 (EffectScope)
// ==========================================

export class EffectScope {
  // 全局存储当前正在执行的 Effect
  static storage = new AsyncLocalStorage<EffectScope>()

  // 依赖集合：记录此 Effect 依赖了哪些 Key
  deps = new Set<InjectionKey<any>>()

  // 清理函数（用于解绑订阅）
  cleanup?: () => void

  constructor(public fn: () => any) {}

  run(): any {
    // 运行前先清理旧订阅，准备重新收集
    if (this.cleanup)
      this.cleanup()

    // 清空本地依赖记录
    this.deps.clear()

    // 在 ALS 上下文中执行函数
    return EffectScope.storage.run(this, this.fn)
  }

  // 方便获取当前的 active effect
  static get current(): EffectScope | undefined {
    return EffectScope.storage.getStore()
  }
}

// ==========================================
// 3. 调度中心 (ReactiveRegistry)
// ==========================================

export class ReactiveRegistry {
  // 存储数据源：Value 或 Getter
  private providers = new Map<InjectionKey<any>, any>()

  // 存储订阅关系：Key -> Set<EffectScope>
  private subscribers = new Map<InjectionKey<any>, Set<EffectScope>>()

  /**
   * 1. 供给 (Provide)
   * 支持直接传入值 (T) 或 Getter (() => T)
   */
  provide<T>(key: InjectionKey<T>, value: T | (() => T)): void {
    this.providers.set(key as InjectionKey<any>, value)
  }

  /**
   * 2. 注入 (Inject/Get)
   * 包含自动依赖收集逻辑
   */
  get<T>(key: InjectionKey<T>): T | undefined {
    // A. 依赖收集
    const activeEffect = EffectScope.current
    if (activeEffect) {
      // 双向绑定：Effect 记录 Key，Key 记录 Effect
      activeEffect.deps.add(key)

      let subs = this.subscribers.get(key as InjectionKey<any>)
      if (!subs) {
        subs = new Set()
        this.subscribers.set(key as InjectionKey<any>, subs)
      }
      subs.add(activeEffect)

      // 设置清理逻辑：当 Effect 销毁或重跑时，从 subs 中移除自己
      const oldCleanup = activeEffect.cleanup
      activeEffect.cleanup = () => {
        if (oldCleanup)
          oldCleanup()
        subs!.delete(activeEffect)
      }
    }

    // B. 获取数据
    const provider = this.providers.get(key as InjectionKey<any>)

    // 智能解包：Getter 则调用
    if (typeof provider === 'function' && provider.length === 0) {
      return provider()
    }
    return provider
  }

  /**
   * 3. 通知 (Notify)
   * 触发依赖更新
   */
  notify(key: InjectionKey<any>): void {
    const effects = this.subscribers.get(key)
    if (effects) {
      // 拷贝 Set 防止遍历过程中 Set 变化
      for (const effect of [...effects]) {
        effect.run()
      }
    }
  }

  /**
   * 运行副作用 (Entry Point)
   * 供 VFS 等消费者使用
   */
  runEffect(fn: () => any): any {
    const effect = new EffectScope(fn)
    return effect.run()
  }
}

/**
 * 创建响应式注册表
 */
export function createReactiveRegistry(): ReactiveRegistry {
  return new ReactiveRegistry()
}

// ==========================================
// 4. 函数式 API (Composition API)
// ==========================================

/**
 * 供给数据
 */
export function useProvide<T>(key: InjectionKey<T>, value: T | (() => T)): void {
  const ce = useCodeEngine()
  ce.provide(key, value)
}

/**
 * 注入数据
 */
export function useInject<T>(key: InjectionKey<T>): T | undefined {
  const ce = useCodeEngine()
  return ce.get(key)
}

/**
 * 通知数据变更
 */
export function notify(key: InjectionKey<any>): void {
  const ce = useCodeEngine()
  ce.notify(key)
}

/**
 * 运行副作用 (Entry Point)
 */
export function runEffect(fn: () => any): any {
  const ce = useCodeEngine()
  return ce.runEffect(fn)
}
