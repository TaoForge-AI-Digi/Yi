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
    {
      type: 'function' as const,
      function: {
        name: 'webfetch',
        description: 'Fetch and return the text content of a URL. Returns the page content as plain text or markdown.',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string', description: 'The fully-formed URL to fetch' } },
          required: ['url'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'websearch',
        description: 'Search the web for recent information. Returns a list of search results with titles, snippets, and URLs.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'The search query' } },
          required: ['query'],
        },
      },
    },
  ]
}
