import { apiGet } from './client'

export interface Character {
  id: string; name: string; description?: string; color?: string
  permissions: { files: string; bash: string }
  builtIn?: boolean
}

export const fetchCharacters = () => apiGet<Character[]>('/api/characters')
