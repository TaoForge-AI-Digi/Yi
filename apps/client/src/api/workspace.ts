import { apiGet } from './client'

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface BrowseResult {
  entries: DirEntry[]
  currentPath: string
  parentPath: string | null
}

export function browseDirectory(path?: string) {
  const q = path ? `?path=${encodeURIComponent(path)}` : ''
  return apiGet<BrowseResult>(`/api/workspace/list${q}`)
}
