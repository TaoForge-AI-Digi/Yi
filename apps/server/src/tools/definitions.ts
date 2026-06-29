export interface ToolResult {
  output: string
  error?: string
  escaped?: boolean
}

export class PathEscapeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PathEscapeError' }
}

export function getToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'read',
        description: 'Read file contents from the workspace',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Path relative to workspace' } },
          required: ['path'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'write',
        description: 'Write content to a file in the workspace',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Path relative to workspace' }, content: { type: 'string', description: 'File content' } },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'bash',
        description: 'Execute a shell command in the workspace directory',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'Shell command to execute' } },
          required: ['command'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'grep',
        description: 'Search file contents using a regex pattern',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern' },
            path: { type: 'string', description: 'Directory to search, relative to workspace (optional)' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'glob',
        description: 'Find files matching a glob pattern',
        parameters: {
          type: 'object',
          properties: { pattern: { type: 'string', description: 'Glob pattern, relative to workspace' } },
          required: ['pattern'],
        },
      },
    },
  ]
}
