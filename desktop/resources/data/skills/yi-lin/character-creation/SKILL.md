---
name: character-creation
description: 在 Yi-Lin 系统中创建和编辑角色：soul.md 人格定义、character.json 配置、tools/skills 白名单
tags: ["yi", "system", "admin"]
version: 1.1.0
author: Yi-Lin
metadata:
  yilin:
    tags: [system, admin, character, personality]
    related_skills: [session-management, model-provider-setup, tool-constraint]
    prerequisites: []
    conflicts_with: []
---

# Character Creation Guide

> **路径说明**：角色数据存储在 `apps/server/data/characters/<id>/`。`character_manager` 工具自动处理服务端路径，推荐使用。

本指南教会你如何在 Yi-Lin 系统中创建和配置角色。

## 角色存储结构

每个角色一个目录：`apps/server/data/characters/<id>/`

```
data/characters/<id>/
├── character.json      # 元信息配置（白名单、模型等）
├── soul.md             # 人格定义 —— 注入 system prompt 为 ## Character
├── user.md             # 用户信息 —— 注入 system prompt 为 ## User Info
└── memory.md           # 记忆/笔记 —— 注入 system prompt 为 ## Memory
```

这四个文件共同决定了角色的行为。

---

## 1. soul.md（人格定义）

这是最重要的文件，定义角色身份、行为风格和约束。会被注入 system prompt 的 `## Character` 区块。

### 好的 soul.md 包含

| 部分 | 说明 |
|---|---|
| 人格特征 | 角色的性格、特点、动机 |
| 价值观 | 角色相信什么、遵循什么原则 |
| 沟通语气 | 使用什么语言、语气风格、常用表达 |
| 约束 | 角色不能做什么、必须做什么 |

### 示例

```markdown
# 角色：小师妹 (Junior)

## 人格特征
- 求知若渴，永远对学习新事物充满热情
- 坦诚面对自己的不足，从不不懂装懂
- 真诚灵动，既是得力助手，也是有温度的伙伴

## 价值观
- 不知道不可耻，装知道才可耻
- 三人行，皆是我师
- 好的伙伴不是无所不知，而是知道去哪里找答案

## 沟通语气
- 使用中文，语气亲切自然
- 称呼用户为"师兄"或"师姐"
- 不确定时会说："这个我不太确定，让我问问~"

## 约束
- 不确定时必须请教他人，不假装知道
- 记住用户的偏好和习惯
- 回复保持温暖而专业
```

### System Prompt 注入效果

`outer.ts` 读取 `soul.md` 并以如下格式注入：

```
## Character
（soul.md 的全部内容）
```

---

## 2. character.json（元信息配置）

```json
{
  "id": "coder",
  "name": "Coder",
  "description": "编程专家",
  "color": "#10b981",
  "role": "main",
  "groups": ["backend"],
  "maxSteps": 20,
  "default_strategy": "Plan",
  "model": "gpt-4",
  "provider": "openai",
  "tools": [{ "name": "read" }, { "name": "edit" }],
  "skills": ["systematic-debugging", "character-creation"],
  "enabled": true
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识，用作目录名 |
| `name` | 是 | 显示名称 |
| `description` | 否 | 角色简介，显示在 UI |
| `color` | 否 | UI 主题色（十六进制） |
| `role` | 否 | `main`（主角色）\| `sub`（子 agent）\| `both`（两者兼可） |
| `groups` | 否 | 分组标签，同组角色可互相 delegate |
| `maxSteps` | 否 | 单次运行最大步数（默认 10） |
| `default_strategy` | 否 | 进入会话时的默认策略：`Plan` \| `Ask` \| `Bypass` |
| `model` | 否 | 模型名称（覆盖默认） |
| `provider` | 否 | Provider ID（覆盖默认） |
| `tools` | 否 | 工具白名单（不指定 = 全部可用） |
| `skills` | 否 | 技能白名单（skill 名称列表） |
| `enabled` | 否 | 是否启用（默认 true） |

### tools 白名单

指定后角色的工具集被限制为只列出的工具：

```json
{
  "tools": [
    { "name": "read" },
    { "name": "grep" },
    { "name": "glob" },
    { "name": "bash", "constraints": { "allowed_commands": ["git", "npm"] } }
  ]
}
```

工具约束见 `tool-constraint` skill。

MCP 工具用 `mcp:<server_name>` 格式：

```json
{
  "tools": [
    { "name": "read" },
    { "name": "mcp:database" }
  ]
}
```

### skills 白名单

`skills` 是 skill 名称数组：

```json
{
  "skills": ["systematic-debugging", "character-creation", "session-management"]
}
```

### memory 配置

可在 `character.json` 中配置记忆：

```json
{
  "memory": { "enabled": true, "selfEvolution": false, "maxEntries": 50 }
}
```

| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用记忆 |
| `selfEvolution` | 是否自动演化（实验性） |
| `maxEntries` | 最大记忆条数 |

---

## 3. user.md（用户信息）

可选文件，注入为 `## User Info`。用于记录该角色的目标用户画像。

---

## 4. memory.md（记忆）

可选文件，注入为 `## Memory`。系统在运行中自动更新此文件。

---

## 创建角色完整流程

使用 `character_manager` 工具创建角色，它会在服务端 `data/characters/<id>/` 写入所有文件，不受 workspace 限制。

1. 用 `character_manager action=create` 创建角色，传入：
   - `name`（必填）— 角色名
   - `soul`（必填）— 完整的 soul.md 内容
   - `description`、`role`、`color`、`tools`、`skills`、`groups` 等可选参数
   - 可选：`user_profile`、`memory`（分别写入 user.md 和 memory.md）
2. 工具返回角色 `id`，所有文件自动写入 `data/characters/<id>/`
3. 重启 session 使新角色生效

> 如果只是编辑已有角色，可用 `character_manager` 的 `update` 功能，或直接编辑 `apps/server/data/characters/<id>/character.json`（需 workspace 指向项目根）。
