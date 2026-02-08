export interface Org {
  id: string
  name: string
}

export async function getOrg(id: string): Promise<Org> {
  return { id, name: 'Org' }
}
