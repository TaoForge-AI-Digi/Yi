import { existsSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'
import type { ToolModule } from '../types.js'
import { assertPathSafe } from '../utils.js'

export const tool: ToolModule = {
  name: 'read',
  description: 'Read file contents from the workspace',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Path relative to workspace' } },
    required: ['path'],
  },
  execute: async (args, { workspace, allowedRoots }) => {
    const p = args.path || ''
    assertPathSafe(p, workspace, allowedRoots)
    const fullPath = resolve(workspace, p)
    if (!existsSync(fullPath)) return { output: '', error: `File not found: ${p}` }
    if (statSync(fullPath).size > 1024 * 1024) return { output: '', error: 'File too large (>1MB)' }
    return { output: readFileSync(fullPath, 'utf-8') }
  },
}
