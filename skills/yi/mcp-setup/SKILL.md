---
name: mcp-setup
description: 在 Yi-Lin 系统中配置 MCP 服务器，连接外部工具和服务
tags: ["yi", "system", "admin"]
---

# MCP Setup Guide

## MCP 配置存储位置

每个 MCP 服务器一个目录：`data/mcpservers/<server_name>/config.json`。

## config.json 结构

```json
{
  "id": "a1b2c3d4-...",
  "name": "database",
  "command": "node",
  "args": ["path/to/mcp-server.js"],
  "env": {
    "DB_URL": "postgresql://localhost/mydb",
    "API_KEY": "sk-..."
  },
  "cwd": "/path/to/server",
  "timeout": 30
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 自动 | UUID，创建时自动生成 |
| `name` | 是 | 服务器名称，用作目录名和 `mcp:` 引用 |
| `command` | 是 | 启动命令（可执行文件路径） |
| `args` | 否 | 命令行参数数组 |
| `env` | 否 | 环境变量（自动继承 process.env） |
| `cwd` | 否 | 工作目录 |
| `timeout` | 否 | 连接超时秒数（默认 30） |

## 注册到角色

在角色的 `character.json` 中用 `mcp:<server_name>` 格式声明：

```json
{
  "tools": [
    { "name": "read" },
    { "name": "mcp:database" },
    { "name": "mcp:filesystem" }
  ]
}
```

Session 启动时自动连接这些 MCP 服务器，将工具展开为 `mcp__<server_name>__<tool_name>` 格式注入 dispatch 表。

## 创建 MCP 服务器流程

1. 确定服务器名称（唯一，用作目录名）
2. 用 `write` 创建 `data/mcpservers/<name>/config.json`
3. 在角色 `character.json` 的 `tools[]` 加入 `{ "name": "mcp:<name>" }`
4. 下次启动 session 时自动连接

## MCP 不可用

如果角色白名单中有 `mcp:<name>` 但服务器未配置或连接失败：
- 系统在 system prompt 中列出不可用工具
- Agent 能看到哪些 MCP 工具无法使用
- 可通过 `edit` 直接修改 `data/mcpservers/<name>/config.json` 修复后重开 session

## 注意事项

- MCP 服务器命令必须在 PATH 中或使用绝对路径
- 环境变量中的敏感信息（API key）会写入磁盘
- 修改配置后需重启 session 生效
- 多个角色可共用同一个 MCP 服务器
