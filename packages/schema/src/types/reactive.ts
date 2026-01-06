/**
 * 注入键
 * 用于标识一个依赖项
 * 使用 intersection type 而不是 interface extends Symbol 以避免 TS 限制
 */
export type InjectionKey<T> = symbol & {
  readonly description?: string
  readonly _?: T
}

/**
 * 副作用函数
 */
export type EffectFn = () => any

/**
 * 响应式上下文接口
 * CodeEngine 实现此接口以提供响应式能力
 */
export interface ReactiveContext {
  /**
   * 供给数据
   * @param key 类型化 Key
   * @param value 值或 Getter 函数
   */
  provide: <T>(key: InjectionKey<T>, value: T | (() => T)) => void

  /**
   * 获取数据 (注入)
   * 自动收集依赖
   * @param key 类型化 Key
   */
  get: <T>(key: InjectionKey<T>) => T | undefined

  /**
   * 通知变更
   * @param key 类型化 Key
   */
  notify: (key: InjectionKey<any>) => void

  /**
   * 运行副作用
   * @param fn 副作用函数
   */
  runEffect: (fn: EffectFn) => any
}
