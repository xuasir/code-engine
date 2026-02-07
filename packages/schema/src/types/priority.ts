export const PRIORITY = {
  USER: 10000,
  CORE: 5000,
  PLUGIN: 3000,
  SHARED: 2000,
  BASE: 100,
} as const

export type Priority = number
