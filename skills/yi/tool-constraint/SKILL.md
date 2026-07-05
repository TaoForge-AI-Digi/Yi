---
name: tool-constraint
description: 为 Yi-Lin 角色配置工具约束：限制路径、命令、文件大小等
tags: ["yi", "system", "admin"]
---

# Tool Constraint Guide

本指南教会你如何在角色白名单中为工具设置约束。

## 约束配置位置

在角色的 `character.json` 的 `tools[]` 中，为每个工具指定 `constraints`：

```json
{
  "tools": [
    { "name": "read",
      "constraints": {
        "allowed_paths": ["src/**"],
        "denied_paths": ["src/secret/**"],
        "max_file_size": "1MB"
      }
    },
    { "name": "bash",
      "constraints": {
        "allowed_commands": ["git", "npm", "node"],
        "denied_patterns": ["rm -rf", "sudo"],
        "readonly": false
      }
    }
  ]
}
```

## ToolConstraint 完整字段

```typescript
interface ToolConstraint {
  allowed_paths?: string[]    // 只允许操作这些路径
  denied_paths?: string[]     // 禁止操作这些路径
  max_file_size?: string      // 最大文件大小（如 "1MB", "500KB"）
  allowed_commands?: string[] // bash 只允许执行这些命令
  denied_patterns?: string[]  // bash 禁止包含这些模式的命令
  readonly?: boolean          // 只读模式（仅 read/grep/glob）
  max_rows?: number           // 查询最大行数
}
```

## 支持约束的工具及字段

| 工具 | 支持的约束 |
|------|-----------|
| `read` | `allowed_paths`, `denied_paths`, `max_file_size` |
| `write` | `allowed_paths`, `denied_paths` |
| `edit` | `allowed_paths`, `denied_paths` |
| `grep` | `allowed_paths`, `denied_paths` |
| `glob` | `allowed_paths`, `denied_paths` |
| `bash` | `allowed_commands`, `denied_patterns` |
| `mcp:*` | `readonly`, `max_rows`（通用约束，由具体 MCP 工具实现） |

## 路径匹配规则

| 模式 | 匹配 |
|------|------|
| `src/**` | src/ 下所有文件及子目录 |
| `src/*` | src/ 下的直接子项 |
| `src/main.ts` | 精确匹配单个文件 |
| `src/` | src/ 目录本身及其下所有内容 |

## 命令限制示例

只允许 git 操作：

```json
{ "name": "bash", "constraints": { "allowed_commands": ["git"] } }
```

允许 git 和 npm，但不允许破坏性操作：

```json
{ "name": "bash", "constraints": {
  "allowed_commands": ["git", "npm"],
  "denied_patterns": ["force", "delete"]
}}
```

## 只读角色

创建一个只能读不能写的审查角色：

```json
{
  "id": "reviewer",
  "tools": [
    { "name": "read", "constraints": { "allowed_paths": ["src/**"] } },
    { "name": "grep", "constraints": { "allowed_paths": ["src/**"] } },
    { "name": "glob" }
  ]
}
```

约束不指定表示不限制。
