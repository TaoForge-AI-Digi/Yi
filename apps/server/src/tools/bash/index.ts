import { execSync } from 'child_process'
import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'bash',
  description: 'Execute a shell command in the workspace directory',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: 'Shell command to execute' } },
    required: ['command'],
  },
  dangerous: true,
  execute: async (args, { workspace, signal }) => {
    const output = execSync(args.command || '', {
      cwd: workspace,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 30000,
      signal,
    } as any).toString().trim()
    return { output }
  },
}
