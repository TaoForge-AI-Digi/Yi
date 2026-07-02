import { execute as registryExecute } from './registry.js'
import { PathEscapeError } from './utils.js'
import type { ToolResult } from './types.js'

export async function executeTool(name: string, args: Record<string, string>, workspace: string, signal?: AbortSignal): Promise<ToolResult> {
  try {
    return await registryExecute(name, args, { workspace, signal })
  } catch (err: any) {
    if (err instanceof PathEscapeError) {
      return { output: '', error: err.message, escaped: true }
    }
    return { output: '', error: `${name}: ${err.message || String(err)}` }
  }
}
