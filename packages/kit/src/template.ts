/**
 * 定义类型安全的模板
 * @param strings 模板字符串片段
 * @param exprs 插值表达式
 * @returns 模板渲染函数
 */
export function defineTemplate<T>(
  strings: TemplateStringsArray,
  ...exprs: Array<(data: T) => string>
): (data: T) => string {
  return (data: T) => {
    return strings.reduce((result, str, i) => {
      const expr = exprs[i - 1]
      return result + (expr ? expr(data) : '') + str
    })
  }
}
