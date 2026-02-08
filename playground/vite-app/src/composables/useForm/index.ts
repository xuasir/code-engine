export function useForm(): { values: Record<string, unknown>; set: (key: string, value: unknown) => void } {
  const values: Record<string, unknown> = {}
  const set = (key: string, value: unknown): void => {
    values[key] = value
  }
  return { values, set }
}
