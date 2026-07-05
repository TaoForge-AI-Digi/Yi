---
name: daily-news-digest
description: 采集主流中文新闻源，按分类整理当日的每日新闻简报（要闻/国内/国际/财经/科技/体育/热点），输出结构化 Markdown
tags: ["web", "news", "daily", "content"]
version: 1.0.0
author: Master Yi
---

# 每日新闻简报 (Daily News Digest)

## 目标

采集当天主流中文新闻网站的实时内容，整理为结构化的 Markdown 新闻简报，包含：要闻 TOP 10、国内、国际、财经/科技、体育、微博/网络热点。

## 前置条件

- 可用的网络工具：webfetch、websearch 或 Playwright MCP 工具（browser_navigate + browser_snapshot）
- 建议优先顺序：Playwright 浏览器 > webfetch > websearch（按成功率排序）

## 步骤

### Step 1：确定可用新闻源

尝试以下新闻源，优先选择可访问的：

| 源 | URL | 类型 | 备注 |
|---|---|---|---|
| 新浪新闻 | https://news.sina.com.cn/ | 中文综合 | 成功率最高，内容最全 |
| 腾讯新闻 | https://news.qq.com/ | 中文综合 | JS 渲染，需 Playwright |
| 百度新闻 | https://news.baidu.com/ | 中文聚合 | webfetch 可获取部分内容 |
| 网易新闻 | https://news.163.com/ | 中文综合 | 备选 |

**容错原则**：
- 先用 `webfetch` 尝试，返回空或 HTML shell 则换下一个
- 如果 `webfetch` 全部失败，使用 Playwright 的 `browser_navigate` + `browser_snapshot` 获取新浪新闻
- 如果 Playwright 也不可用，退而用 `websearch` 搜索 "今日新闻 热点" 获取摘要

### Step 2：提取新闻内容

根据页面内容提取新闻标题。提取策略取决于页面类型：

**A. 纯 HTML 页面（webfetch 成功）**：
- 从 `<a>` 标签的文本内容中提取新闻标题
- 从 `<h1>`, `<h2>` 等标题标签中提取要闻
- 过滤掉广告链接（可依据 class 名如 `ad`, `sinaads` 等判断）

**B. Playwright 获取的页面（browser_snapshot）**：
- 从 YAML snapshot 中提取 `link` 元素的文本内容
- 关注 `heading` 级别的内容（`level=1` 通常是重要新闻）
- 从 `list` / `listitem` 结构中提取新闻列表

**C. websearch 搜索结果**：
- 提取每个结果的 title 和 snippet

### Step 3：分类整理

将提取到的新闻按以下分类组织：

```
## 📌 要闻 TOP 10
- 最重要的 10 条新闻（加权：政治 > 社会 > 财经 > 娱乐）

## 🌍 国际新闻
- 国际政治、外交、军事、全球事件

## 🇨🇳 国内 / 社会
- 国内政策、社会新闻、民生、天气灾害

## 💰 财经 / 科技
- 股市、企业动态、科技产品、AI/互联网

## ⚽ 体育
- 赛事结果、转会、体育人物

## 🔥 热点 / 网络热榜
- 微博热搜、社交平台热议话题
```

### Step 4：去重与排序

- 同一新闻出现在多个源时，取信源较权威的版本
- 按新闻重要性降序排列，同类新闻按时间降序
- 去除明显广告和低质量内容

### Step 5：输出 Markdown 简报

输出格式示例：

```markdown
# 📰 每日新闻速递 | YYYY年M月D日（周X）

---

### 🔴 要闻 TOP 10

| # | 新闻标题 |
|:-:|:---|
| 1 | **标题** |
| ... | ... |

---

### 🌍 国际新闻
- ...

### 🇨🇳 国内 / 社会
- ...

### 💰 财经 / 科技
- ...

### ⚽ 体育
- ...

### 🔥 热点 / 网络热榜
- ...
```

### Step 6：保存

将最终简报保存到 `default/news-digest/` 目录，文件名格式：`YYYY-MM-DD-news-digest.md`

## 约束

- **不要虚构新闻内容** — 所有标题必须来自实际获取的页面数据
- 如果所有新闻源都不可用，直接报告失败原因，不编造内容
- 单条简报不超过 80 条新闻（保持可读性）
- 分类标签保持统一，不要随意增减分类

## 完成条件

- ✅ 成功从至少一个新闻源获取内容
- ✅ 按分类整理完毕
- ✅ 输出了格式规范的 Markdown 简报
- ✅ 文件已保存到 workspace

## 故障排除

| 症状 | 对策 |
|---|---|
| webfetch 返回空/纯 JS 页面 | 换 Playwright 浏览器获取 |
| websearch 全部失败 | 直接打开新闻网站网址 |
| Playwright snapshot 获取不到文字 | 尝试提取页面标题和可见文本内容 |
| 单源内容太少 | 合并多个源的结果 |
