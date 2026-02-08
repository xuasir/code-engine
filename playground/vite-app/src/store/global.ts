export interface GlobalState {
  theme: string
}

const state: GlobalState = { theme: 'light' }

export function setTheme(next: string): void {
  state.theme = next
}

export function getTheme(): string {
  return state.theme
}

export default state
