---
name: model-provider-setup
description: 在 Yi-Lin 系统中配置 LLM 提供商和模型
tags: ["yi", "system", "admin"]
---

# Model/Provider Setup Guide

## Provider 存储位置

Provider 配置存储在 `data/providers.json`，一个 JSON 数组。

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

用 `edit` 修改 `data/providers.json`，追加新条目：

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

首次运行时系统不创建默认 provider。需通过 API 或直接编辑 `data/providers.json` 添加。
