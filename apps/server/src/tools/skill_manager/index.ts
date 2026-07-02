import { findSkillByName, skillDirFor, SKILLS_ROOT } from '../../agent/skill-loader.js'
import type { ToolModule } from '../types.js'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'

const USER_SKILL_DIR = join(SKILLS_ROOT, 'user')

export const tool: ToolModule = {
  name: 'skill_manager',
  description: '技能管理（仅操作当前角色白名单内的技能）。view: 查看技能内容 | create: 创建技能 | edit: 编辑技能 | delete: 删除技能 | write_file: 写入附属文件 | remove_file: 删除附属文件',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['view', 'create', 'edit', 'delete', 'write_file', 'remove_file'],
        description: '操作类型',
      },
      name: { type: 'string', description: '技能名称（view/create/edit/delete/write_file/remove_file 必填）' },
      content: { type: 'string', description: 'SKILL.md 完整内容（create/edit 必填）' },
      file_path: { type: 'string', description: '附属文件路径，相对于技能目录（write_file/remove_file 必填）' },
      file_content: { type: 'string', description: '附属文件内容（write_file 必填）' },
    },
    required: ['action'],
  },
  execute: async (args) => {
    const action = args.action
    if (!action) return { output: '', error: 'action is required' }

    switch (action) {
      case 'view': {
        const name = args.name
        if (!name) return { output: '', error: 'name is required for view' }
        const skill = findSkillByName(name)
        if (!skill) return { output: '', error: `Skill "${name}" not found` }
        const header = `# ${skill.frontmatter.name || name}\n${skill.frontmatter.description ? `> ${skill.frontmatter.description}\n` : ''}`
        return { output: header + skill.body }
      }

      case 'create': {
        const name = args.name
        const content = args.content
        if (!name) return { output: '', error: 'name is required for create' }
        if (!content) return { output: '', error: 'content is required for create' }
        const dir = join(USER_SKILL_DIR, name)
        if (existsSync(dir)) return { output: '', error: `Skill "${name}" already exists` }
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8')
        return { output: `Skill "${name}" created in user skills` }
      }

      case 'edit': {
        const name = args.name
        const content = args.content
        if (!name) return { output: '', error: 'name is required for edit' }
        if (!content) return { output: '', error: 'content is required for edit' }
        const skill = findSkillByName(name)
        if (!skill) return { output: '', error: `Skill "${name}" not found` }
        writeFileSync(join(skill.dir, 'SKILL.md'), content, 'utf-8')
        return { output: `Skill "${name}" updated` }
      }

      case 'delete': {
        const name = args.name
        if (!name) return { output: '', error: 'name is required for delete' }
        const dir = skillDirFor(name)
        if (!dir) return { output: '', error: `Skill "${name}" not found` }
        rmSync(dir, { recursive: true, force: true })
        return { output: `Skill "${name}" deleted` }
      }

      case 'write_file': {
        const name = args.name
        const filePath = args.file_path
        const fileContent = args.file_content
        if (!name) return { output: '', error: 'name is required for write_file' }
        if (!filePath) return { output: '', error: 'file_path is required for write_file' }
        if (!fileContent) return { output: '', error: 'file_content is required for write_file' }
        const dir = skillDirFor(name)
        if (!dir) return { output: '', error: `Skill "${name}" not found` }
        const fullPath = join(dir, filePath)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, fileContent, 'utf-8')
        return { output: `File "${filePath}" written to skill "${name}"` }
      }

      case 'remove_file': {
        const name = args.name
        const filePath = args.file_path
        if (!name) return { output: '', error: 'name is required for remove_file' }
        if (!filePath) return { output: '', error: 'file_path is required for remove_file' }
        const dir = skillDirFor(name)
        if (!dir) return { output: '', error: `Skill "${name}" not found` }
        const fullPath = join(dir, filePath)
        if (!existsSync(fullPath)) return { output: '', error: `File "${filePath}" not found in skill "${name}"` }
        rmSync(fullPath, { force: true })
        return { output: `File "${filePath}" removed from skill "${name}"` }
      }

      default:
        return { output: '', error: `Unknown action: ${action}` }
    }
  },
}
