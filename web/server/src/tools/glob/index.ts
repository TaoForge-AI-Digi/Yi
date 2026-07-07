import { globSync } from 'glob'
import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'glob',
  description: 'Find files matching a glob pattern',
  parameters: {
    type: 'object',
    properties: { pattern: { type: 'string', description: 'Glob pattern, relative to workspace' } },
    required: ['pattern'],
  },
  execute: async (args, { workspace }) => {
    const matches = globSync(args.pattern || '', { cwd: workspace, dot: true })
    return { output: matches.length ? matches.join('\n') : 'No files matched' }
  },
}
