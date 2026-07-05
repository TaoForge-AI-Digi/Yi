import { execSync } from 'child_process'
import type { ToolModule } from '../types.js'
import { assertPathSafe } from '../utils.js'

const WIN_ABS_PATH_RE = /[A-Za-z]:\\[^\s"'|&;<>(){}[\]`~!@#$%^&*=+]+/g

export const tool: ToolModule = {
  name: 'bash',
  description: 'Execute a shell command in the workspace directory',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: 'Shell command to execute' } },
    required: ['command'],
  },
  dangerous: true,
  execute: async (args, { workspace, signal, allowedRoots }) => {
    const cmd = args.command || ''
    const absPaths = cmd.match(WIN_ABS_PATH_RE)
    if (absPaths) {
      for (const raw of absPaths) {
        assertPathSafe(raw, workspace, allowedRoots)
      }
    }
    const output = execSync(cmd, {
      cwd: workspace,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 30000,
      signal,
    } as any).toString().trim()
    return { output }
  },
}
