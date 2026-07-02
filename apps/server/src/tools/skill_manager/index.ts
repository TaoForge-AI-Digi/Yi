import { findSkillByName } from '../../agent/skill-loader.js'
import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'skill_manager',
  description: '查看指定技能的完整 SKILL.md 内容。技能列表见系统提示中的 Available Skills。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['view'], description: 'view: 查看技能内容' },
      name: { type: 'string', description: '技能名称（view 必填）' },
    },
    required: ['action', 'name'],
  },
  execute: async (args) => {
    const name = args.name
    if (!name) return { output: '', error: 'name is required' }
    const skill = findSkillByName(name)
    if (!skill) return { output: '', error: `Skill "${name}" not found` }
    const header = `# ${skill.frontmatter.name || name}\n${skill.frontmatter.description ? `> ${skill.frontmatter.description}\n` : ''}`
    return { output: header + skill.body }
  },
}
