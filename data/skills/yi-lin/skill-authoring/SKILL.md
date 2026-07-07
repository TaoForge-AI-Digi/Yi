---
name: skill-authoring
description: 指引 AI agent 在 Yi-Lin 系统中设计、编写和注册新技能的完整参考
tags: ["system", "reference", "meta"]
version: 1.1.0
author: Yi-Lin
metadata:
  yilin:
    tags: [skill-authoring, meta, reference]
    related_skills: []
    prerequisites: []
    conflicts_with: []
---

# Skill Authoring Guide

本指南教会你如何在 Yi-Lin 系统中创建并注册一个完整可用的 Skill。

## Skill 是什么

Skill 是一份 Markdown 文档（`SKILL.md`），放在 `skills/<category>/<name>/` 目录下。它告诉 AI agent 如何完成某类任务。Skill 可以附带脚本、模板、参考文档等附件。

Skill 的文件操作（创建、编辑附件、注册）直接用 `read`/`write`/`edit`/`glob` 完成，不需要专门的工具。

## SKILL.md 结构

### Frontmatter（必需的元信息）

文件最顶部用 `---` 包裹的 YAML 格式元数据：

```yaml
---
name: my-skill           # 技能名称（唯一标识，用作目录名）
description: 做什么的      # 一句话说明，会显示在 UI 和 system prompt 中
tags: ["tag1", "tag2"]   # 分类标签，前端按此筛选
version: 1.0.0           # 版本号（可选）
author: Yi-Lin           # 作者（可选）
metadata:
  yilin:
    tags: [tag1, tag2]         # 英文标签，供 agent 按能力维度匹配
    related_skills: []         # 有序关联 skill，越前越紧密；支持渐进式引导
    prerequisites: []          # 前置 skill，使用前应已掌握
    conflicts_with: []         # 不兼容 skill（场景冲突时避免同时加载）
---
```

### metadata.yilin（技能关系网）

`metadata.yilin` 定义技能之间的关系，让 agent 自动实现渐进式引导：

| 字段 | 说明 |
|---|---|
| `tags` | 英文标签，按能力维度分类。agent 据此匹配技能，不受中文标签限制 |
| `related_skills` | **有序数组**。越靠前关联越紧密，或在工作流中越先执行。agent 完成本技能后，按此顺序逐项推荐下一步 |
| `prerequisites` | 前置技能。用户调用本技能时，agent 先检查这些技能是否已掌握，未掌握则提示"建议先了解 X" |
| `conflicts_with` | 不兼容技能。同时加载可能产生指令冲突 |

**与渐进式披露的关系：** 这四组字段构成了技能引导路径的数据驱动描述。agent 不需要硬编码逻辑，只需读取 metadata 就能决定：

1. 用户触发技能 → 检查 `prerequisites`，未满足则先引导前置
2. 技能执行完毕 → 按 `related_skills` 顺序推荐下一步（一次只推荐一个）
3. 按 `tags` 过滤当前场景不相关的技能，避免信息过载

### Body（核心指令）

Frontmatter 之后的内容是 body，用 Markdown 书写。Body 就是注入 agent system prompt 的指令。好的 body 应该：

1. **明确目标** — 开头说明这个 Skill 解决什么问题
2. **步骤化** — 把任务拆成清晰的步骤
3. **具体约束** — 告诉 agent 能用什么工具、不能做什么
4. **示例** — 给出输入输出例子
5. **完成条件** — 明确什么算"做完"

### 附件目录约定

Skill 目录下可以放这些子目录：

| 目录 | 用途 |
|---|---|
| `references/` | 参考文档、规范、设计文档 |
| `scripts/` | 可执行脚本（bash/python） |
| `templates/` | 代码模板、配置模板 |
| `tests/` | 测试用例 |
| `assets/` | 图片、数据文件等资源 |

## 创建 Skill 的完整流程

### 第一步：确定需求

- 这个 Skill 解决什么具体问题？
- 目标用户是谁？（哪个角色会用它？）
- 需要哪些前置条件？

### 第二步：编写 SKILL.md

用 `write` 创建 `skills/<category>/<name>/SKILL.md`，内容必须包含完整的 frontmatter + body。Body 要写得让另一个 AI agent 能直接照着执行。

参考模板：

```markdown
---
name: my-automation
description: 自动化完成 XX 任务
tags: ["automation", "utility"]
metadata:
  yilin:
    tags: [automation, utility]
    related_skills: [related-skill-a, related-skill-b]
    prerequisites: [foundation-skill]
    conflicts_with: []
---

# My Automation

## 目标
完成 XX 任务。

## 步骤
1. 先用 read/grep 了解项目结构
2. 再用 edit/write 修改文件
3. 最后用 bash 验证

## 约束
- 不要删除未指定的文件
- 修改前先读原文件
```

### 第三步：添加附件（可选）

用 `write` 写入 `skills/<category>/<name>/<path>`，如 `scripts/deploy.sh`、`references/guide.md`。

### 第四步：注册到角色

先用 `character_manager action=get` 获取角色配置，或直接操作 `apps/server/data/characters/<id>/character.json`（需 workspace 指向项目根）。用 `edit` 把 skill 名称加入 `skills[]` 数组。

之后该角色启动 session 时就会加载这个 skill。

### 第五步：验证

确认：
- SKILL.md frontmatter 有 `name` 和 `description`
- `metadata.yilin` 字段完整（`tags`、`related_skills`、`prerequisites`、`conflicts_with` 都存在，可为空数组）
- `related_skills` 顺序合理（越前越紧密或越先执行）
- `prerequisites` 中的 skill 确实存在
- Body 内容完整可执行
- Skill 已在角色白名单中
- 前端 Skill 页面能正常显示

## 设计原则

1. **单一职责** — 一个 Skill 只做一件事
2. **自包含** — Skill 不依赖外部未说明的资源
3. **可测试** — 给出成功标准
4. **渐进式** — 从简单开始，复杂可以加附件
