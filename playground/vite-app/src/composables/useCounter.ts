export function useCounter(): { count: number, inc: () => void, dec: () => void } {
  let count = 0
  const inc: () => void = () => {
    count += 1
  }
  const dec: () => void = () => {
    count -= 1
  }
  return { count, inc, dec }
}
