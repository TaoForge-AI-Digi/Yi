import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import type { ToolModule } from '../types.js'
import { assertPathSafe, findFirstOccurrence, replaceAllOccurrences } from '../utils.js'

export const tool: ToolModule = {
  name: 'edit',
  description: 'Apply an exact-string replacement edit to a file in the workspace. Replaces the first occurrence of oldString with newString. Use unique surrounding context to target the right match. Set replaceAll to true to replace every occurrence.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to workspace' },
      oldString: { type: 'string', description: 'The exact text to search for (include enough surrounding context for a unique match)' },
      newString: { type: 'string', description: 'The replacement text' },
      replaceAll: { type: 'boolean', description: 'Replace all occurrences instead of just the first (optional)' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  dangerous: true,
  execute: async (args, { workspace }) => {
    const p = args.path || ''
    assertPathSafe(p, workspace)
    const fullPath = resolve(workspace, p)
    if (!existsSync(fullPath)) return { output: '', error: `File not found: ${p}` }
    const content = readFileSync(fullPath, 'utf-8')
    const oldString = args.oldString || ''
    const newString = args.newString || ''
    const replaceAll = args.replaceAll === 'true'
    if (!oldString) return { output: '', error: 'oldString is required' }
    if (replaceAll) {
      if (findFirstOccurrence(content, oldString) === -1) return { output: '', error: 'oldString not found in file' }
      writeFileSync(fullPath, replaceAllOccurrences(content, oldString, newString), 'utf-8')
      return { output: `Replaced all occurrences of oldString in ${p}` }
    }
    const idx = findFirstOccurrence(content, oldString)
    if (idx === -1) return { output: '', error: 'oldString not found in file' }
    const newContent = content.slice(0, idx) + newString + content.slice(idx + oldString.length)
    writeFileSync(fullPath, newContent, 'utf-8')
    return { output: `Applied edit at position ${idx} in ${p} (${oldString.length} chars replaced with ${newString.length} chars)` }
  },
}
