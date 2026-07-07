---
name: model-provider-setup
description: 在 Yi-Lin 系统中配置 LLM 提供商和模型
tags: ["yi", "system", "admin"]
version: 1.1.0
author: Yi-Lin
metadata:
  yilin:
    tags: [system, admin, llm, provider]
    related_skills: [character-creation, session-management]
    prerequisites: []
    conflicts_with: []
---

# Model/Provider Setup Guide

> **路径说明**：Server 数据文件位于 `apps/server/data/`（非默认 workspace 路径）。Agent 需 workspace 设置到项目根或经用户授权后才能通过 `bash` 用绝对路径访问。

## Provider 存储位置

Provider 配置存储在 `apps/server/data/providers.json`，一个 JSON 数组。

## ProviderRecord 结构

```json
{
  "id": "openai",
  "name": "OpenAI",
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-...",
  "models": [
    { "id": "gpt-4o", "name": "GPT-4o" },
    { "id": "gpt-4o-mini", "name": "GPT-4o Mini" },
    { "id": "o1", "name": "o1" }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，角色用 `provider` 字段引用 |
| `name` | 显示名称 |
| `base_url` | API 基础 URL（兼容 OpenAI 格式） |
| `api_key` | API 密钥 |
| `models[]` | 可用模型列表 |

## 添加 Provider

用 `read`/`write`/`edit` 修改 `apps/server/data/providers.json`（需 workspace 指向项目根），追加新条目：

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "base_url": "https://api.deepseek.com/v1",
  "api_key": "sk-...",
  "models": [
    { "id": "deepseek-chat", "name": "DeepSeek Chat" }
  ]
}
```

## 配置角色使用特定模型

在角色的 `character.json` 中指定 `provider` 和 `model`：

```json
{
  "id": "coder",
  "provider": "deepseek",
  "model": "deepseek-chat"
}
```

不指定则使用系统默认。

## 默认 Provider

系统默认已配置若干 provider，可通过 `read apps/server/data/providers.json` 查看。添加新 provider 需通过 API 或直接编辑该文件。
