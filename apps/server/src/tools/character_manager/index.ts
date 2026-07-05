import type { ToolModule } from '../types.js'
import { characterMetaStore } from '../../db/characterStore.js'
import { characterContentStore } from '../../character/store.js'

export const tool: ToolModule = {
  name: 'character_manager',
  description: 'Create a character with soul.md + character.json + user.md + memory.md. All files are written server-side to data/characters/<id>/ — workspace-independent. Returns the new character ID.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create'],
        description: 'Create a new character with all required files.',
      },
      name: {
        type: 'string',
        description: 'Character display name (required).',
      },
      soul: {
        type: 'string',
        description: 'SOUL.md content — the character\'s personality definition (required).',
      },
      description: {
        type: 'string',
        description: 'Short description of the character.',
      },
      user_profile: {
        type: 'string',
        description: 'USER.md content — template/instructions about the user.',
      },
      memory: {
        type: 'string',
        description: 'MEMORY.md content — initial memory / background context.',
      },
      role: {
        type: 'string',
        enum: ['main', 'sub', 'both'],
        description: 'Character role (default: "both").',
      },
      tools: {
        type: 'string',
        description: 'Comma-separated tool names to whitelist (e.g. "read,write,bash").',
      },
      skills: {
        type: 'string',
        description: 'Comma-separated skill names to attach (e.g. "character-creation,session-management").',
      },
      color: {
        type: 'string',
        description: 'Hex color for the character avatar (e.g. "#6366f1").',
      },
      groups: {
        type: 'string',
        description: 'Comma-separated group names.',
      },
      default_strategy: {
        type: 'string',
        enum: ['Plan', 'Ask', 'Bypass'],
        description: 'Default tool-use strategy (default: "Ask").',
      },
      maxSteps: {
        type: 'string',
        description: 'Maximum turns per session (default: "10").',
      },
    },
    required: ['action', 'name', 'soul'],
  },
  execute: async (args) => {
    const action = args.action
    if (action !== 'create') {
      return { output: '', error: `Invalid action: ${action}` }
    }

    const tools = args.tools
      ? args.tools.split(',').map(t => t.trim()).filter(Boolean).map(name => ({ name }))
      : undefined
    const skills = args.skills
      ? args.skills.split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    const groups = args.groups
      ? args.groups.split(',').map(g => g.trim()).filter(Boolean)
      : undefined
    const maxSteps = args.maxSteps ? parseInt(args.maxSteps, 10) || 10 : 10

    const record = characterMetaStore.create({
      name: args.name,
      description: args.description || undefined,
      color: args.color || '#6366f1',
      role: (args.role as 'main' | 'sub' | 'both') || 'both',
      tools,
      skills,
      groups,
      maxSteps,
      default_strategy: (args.default_strategy as 'Plan' | 'Ask' | 'Bypass') || 'Ask',
      enabled: true,
    })

    characterContentStore.save(record.id, {
      soul: args.soul,
      user: args.user_profile,
      memory: args.memory,
    })

    const summary = [
      `Character "${record.name}" created (id: ${record.id})`,
      `  Files: data/characters/${record.id}/`,
      `    - character.json (metadata)`,
      `    - soul.md`,
      `    - user.md`,
      `    - memory.md`,
    ]
    if (tools?.length) summary.push(`  Tools: ${tools.map(t => t.name).join(', ')}`)
    if (skills?.length) summary.push(`  Skills: ${skills.join(', ')}`)
    if (record.role) summary.push(`  Role: ${record.role}`)

    return { output: summary.join('\n') }
  },
}
