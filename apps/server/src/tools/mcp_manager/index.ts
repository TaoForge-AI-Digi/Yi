import { mcpServerStore } from '../../db/toolStore.js'
import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'mcp_manager',
  description: 'MCP 服务器管理（仅操作当前角色白名单内的 MCP 工具）。list: 列出所有 MCP 服务器 | view: 查看服务器配置 | create: 创建新的 MCP 服务器 | edit: 修改已有服务器 | delete: 删除服务器',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'view', 'create', 'edit', 'delete'],
        description: '操作类型',
      },
      name: { type: 'string', description: '服务器名称（view/create/edit/delete 必填）' },
      command: { type: 'string', description: '启动命令（create 必填, edit 选填）' },
      args: { type: 'array', items: { type: 'string' }, description: '命令行参数（create/edit 选填）' },
      env: { type: 'object', additionalProperties: { type: 'string' }, description: '环境变量（create/edit 选填）' },
    },
    required: ['action'],
  },
  execute: async (rawArgs) => {
    const args = rawArgs as Record<string, any>
    const action = args.action
    if (!action) return { output: '', error: 'action is required' }

    switch (action) {
      case 'list': {
        const servers = mcpServerStore.getAll()
        if (servers.length === 0) return { output: 'No MCP servers configured.' }
        const lines = servers.map(s => {
          const envStr = Object.keys(s.env).length > 0 ? ` env:${Object.keys(s.env).join(',')}` : ''
          return `- ${s.name}: ${s.command} ${(s.args || []).join(' ')}${envStr}`
        })
        return { output: `MCP Servers:\n${lines.join('\n')}` }
      }

      case 'view': {
        const name = args.name
        if (!name) return { output: '', error: 'name is required for view' }
        const server = mcpServerStore.getByName(name)
        if (!server) return { output: '', error: `MCP server "${name}" not found` }
        const envStr = Object.entries(server.env)
          .map(([k, v]) => `  ${k}=${v}`)
          .join('\n')
        return {
          output: [
            `Name: ${server.name}`,
            `Command: ${server.command}`,
            `Args: ${(server.args || []).join(' ') || '(none)'}`,
            `Env:\n${envStr || '  (none)'}`,
          ].join('\n'),
        }
      }

      case 'create': {
        const name = args.name
        const command = args.command
        if (!name) return { output: '', error: 'name is required for create' }
        if (!command) return { output: '', error: 'command is required for create' }
        if (mcpServerStore.getByName(name)) {
          return { output: '', error: `MCP server "${name}" already exists` }
        }
        const record = mcpServerStore.create({
          name,
          command,
          args: args.args || [],
          env: args.env || {},
        })
        return { output: `MCP server "${name}" created (id: ${record.id})` }
      }

      case 'edit': {
        const name = args.name
        if (!name) return { output: '', error: 'name is required for edit' }
        const existing = mcpServerStore.getByName(name)
        if (!existing) return { output: '', error: `MCP server "${name}" not found` }
        const patch: Record<string, any> = {}
        if (args.command !== undefined) patch.command = args.command
        if (args.args !== undefined) patch.args = args.args
        if (args.env !== undefined) patch.env = args.env
        if (Object.keys(patch).length === 0) return { output: '', error: 'nothing to update' }
        mcpServerStore.update(existing.id, patch)
        return { output: `MCP server "${name}" updated` }
      }

      case 'delete': {
        const name = args.name
        if (!name) return { output: '', error: 'name is required for delete' }
        const existing = mcpServerStore.getByName(name)
        if (!existing) return { output: '', error: `MCP server "${name}" not found` }
        mcpServerStore.delete(existing.id)
        return { output: `MCP server "${name}" deleted` }
      }

      default:
        return { output: '', error: `Unknown action: ${action}` }
    }
  },
}
