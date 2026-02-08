export interface UserState {
  id: string | null
  name: string | null
}

const state: UserState = { id: null, name: null }

export function setUser(id: string, name: string): void {
  state.id = id
  state.name = name
}

export function clearUser(): void {
  state.id = null
  state.name = null
}

export function getUser(): UserState {
  return state
}

export default state
