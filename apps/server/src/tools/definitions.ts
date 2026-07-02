export const DANGEROUS_TOOLS = [
  'write', 'edit', 'delete', 'patch',
  'bash', 'execute', 'mcp_exec',
  'delegate_task',
]

export interface ToolConstraint {
  allowed_paths?: string[]
  denied_paths?: string[]
  max_file_size?: string
  allowed_commands?: string[]
  denied_patterns?: string[]
  readonly?: boolean
  max_rows?: number
  require_confirm_even_in_bypass?: boolean
}

export interface ToolBinding {
  name: string
  constraints?: ToolConstraint
}

export interface ToolResult {
  output: string
  error?: string
  escaped?: boolean
}

export class PathEscapeError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PathEscapeError' }
}

function matchPath(pattern: string, target: string): boolean {
  if (pattern.endsWith('/**')) return target.startsWith(pattern.slice(0, -3)) || target === pattern.slice(0, -3)
  if (pattern.endsWith('*')) return target.startsWith(pattern.slice(0, -1))
  return target === pattern || target.startsWith(pattern + '/')
}

export function validateConstraints(toolName: string, args: Record<string, any>, binding: ToolBinding): string | null {
  const c = binding.constraints
  if (!c) return null

  if (args.path) {
    if (c.allowed_paths && c.allowed_paths.length > 0) {
      const ok = c.allowed_paths.some(p => matchPath(p, args.path))
      if (!ok) return `Path "${args.path}" is not in allowed paths: ${c.allowed_paths.join(', ')}`
    }
    if (c.denied_paths && c.denied_paths.length > 0) {
      const denied = c.denied_paths.some(p => matchPath(p, args.path))
      if (denied) return `Path "${args.path}" is denied`
    }
  }

  if (args.content && c.max_file_size) {
    const bytes = new TextEncoder().encode(args.content).length
    const max = parseFileSize(c.max_file_size)
    if (max > 0 && bytes > max) return `File content exceeds max size ${c.max_file_size} (${bytes} bytes)`
  }

  if (toolName === 'bash' && args.command) {
    const cmd = args.command.trim().split(/\s+/)[0]
    if (c.allowed_commands && c.allowed_commands.length > 0) {
      if (!c.allowed_commands.includes(cmd)) return `Command "${cmd}" is not in allowed commands: ${c.allowed_commands.join(', ')}`
    }
    if (c.denied_patterns && c.denied_patterns.length > 0) {
      for (const pattern of c.denied_patterns) {
        if (args.command.includes(pattern)) return `Command contains denied pattern: "${pattern}"`
      }
    }
  }

  if (toolName.startsWith('mcp:') || toolName === 'mcp:db_query') {
    if (c.readonly && args.query) {
      const trimmed = args.query.trim().toUpperCase()
      if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE') || trimmed.startsWith('DROP')) {
        return 'Write queries are not allowed in read-only mode'
      }
    }
    if (c.max_rows && args.limit && args.limit > c.max_rows) {
      return `Query limit ${args.limit} exceeds max rows ${c.max_rows}`
    }
  }

  return null
}

function parseFileSize(s: string): number {
  const m = s.match(/^(\d+)\s*(B|KB|MB|GB)?$/i)
  if (!m) return 0
  const num = parseInt(m[1])
  const unit = (m[2] || 'B').toUpperCase()
  const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 }
  return num * (multipliers[unit] || 1)
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
    {
      type: 'function' as const,
      function: {
        name: 'delegate_task',
        description: '委托子任务给同组 sub 角色',
        parameters: {
          type: 'object',
          properties: {
            task: { type: 'string', description: '子任务描述' },
            target_character_id: { type: 'string', description: '目标角色 ID' },
            sub_strategy: { type: 'string', enum: ['Plan', 'Ask', 'Bypass'], description: '子任务策略（可选，默认继承）' },
            instances: { type: 'number', description: '并发实例数（可选，默认 1）' },
          },
          required: ['task', 'target_character_id'],
        },
      },
    },
  ]
}
