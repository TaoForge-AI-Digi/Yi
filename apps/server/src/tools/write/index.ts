import { writeFileSync } from 'fs'
import { resolve } from 'path'
import type { ToolModule } from '../types.js'
import { assertPathSafe } from '../utils.js'

export const tool: ToolModule = {
  name: 'write',
  description: 'Write content to a file in the workspace',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to workspace' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
  dangerous: true,
  execute: async (args, { workspace, workspaces, allowedRoots }) => {
    const p = args.path || ''
    assertPathSafe(p, workspaces ?? [workspace], allowedRoots)
    writeFileSync(resolve(workspace, p), args.content || '', 'utf-8')
    return { output: `Written ${(args.content || '').length} bytes to ${p}` }
  },
}
