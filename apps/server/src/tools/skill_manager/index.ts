import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { ToolModule } from '../types.js'
import { findSkillByName, SKILLS_ROOT } from '../../agent/skill-loader.js'

export const tool: ToolModule = {
  name: 'skill_manager',
  description: 'List available skills or read a skill\'s full SKILL.md content. Skills are discovered server-side (workspace-independent).',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'read'],
        description: '"list" returns all available skills with descriptions; "read" returns a skill\'s full SKILL.md content.',
      },
      skill_name: {
        type: 'string',
        description: 'Required when action="read". The name of the skill to read (e.g. "character-creation").',
      },
    },
    required: ['action'],
  },
  execute: async (args) => {
    const action = args.action
    if (action === 'list') {
      const categories = readdirSync(SKILLS_ROOT, { withFileTypes: true })
      const result: { category: string; skills: { name: string; description: string }[] }[] = []
      for (const cat of categories) {
        if (!cat.isDirectory()) continue
        const catPath = join(SKILLS_ROOT, cat.name)
        const entries = readdirSync(catPath, { withFileTypes: true })
        const skills: { name: string; description: string }[] = []
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const skillFile = join(catPath, entry.name, 'SKILL.md')
          if (!existsSync(skillFile)) continue
          const content = readFileSync(skillFile, 'utf-8')
          const descMatch = content.match(/^description:\s*(.+)$/m)
          skills.push({ name: entry.name, description: descMatch?.[1]?.trim() || '' })
        }
        if (skills.length > 0) result.push({ category: cat.name, skills })
      }
      return { output: JSON.stringify(result, null, 2) }
    }

    if (action === 'read') {
      const name = args.skill_name
      if (!name) return { output: '', error: 'skill_name is required when action="read"' }
      const found = findSkillByName(name)
      if (!found) return { output: '', error: `Skill "${name}" not found` }
      const content = readFileSync(join(found.dir, 'SKILL.md'), 'utf-8')
      return { output: content }
    }

    return { output: '', error: `Invalid action: ${action}` }
  },
}
