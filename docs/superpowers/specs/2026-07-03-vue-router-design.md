# Vue Router 路由化设计

## 背景

当前 Yi-Lin Client 是完全无路由的 SPA，所有"导航"靠 App.vue 的 `onMounted` 从 `localStorage` 恢复 session。刷新页面时 `localStorage` 可能过期或丢失，导致 fallback 到新建 session，即用户反馈的"乱跳"问题。

## 路由表

```
/                    → redirect → /c/:lastSessionId，无有效 session 时新建并跳转
/c/:id               → ChatView（纯聊天，无侧面板）
/c/:id/files         → ChatView + FilesPanel（右侧）
/c/:id/outline       → ChatView + OutlinePanel（右侧）
/settings            → SettingsView（默认 tab）
/settings/:tab       → SettingsView（指定 tab）
/*path               → NotFound
```

## 组件架构

### 布局

```
App.vue
├── Sidebar (始终显示)
└── <router-view> (按路由切换)
    ├── ChatView      ← /c/:id 及子路由
    │   ├── ChatArea
    │   └── SidePanel (可选，仅 /c/:id/files 和 /c/:id/outline 时显示)
    └── SettingsView  ← /settings(/:tab)
```

### 命名视图

不使用命名视图。`ChatView` 是一个新 wrapper 组件，内部条件渲染 `SidePanel`：
- `/c/:id` → `SidePanel` 隐藏
- `/c/:id/files` → `SidePanel` 显示 `FilesPanel`
- `/c/:id/outline` → `SidePanel` 显示 `OutlinePanel`

## Session ↔ URL 同步

### 核心流程

```
页面加载 /c/:id
  → route.params.id → chatStore.switchSession(id)
  → 如果 id 无效 → 重定向到最近有效 session 或 /c/new 新建

用户点击 Sidebar session
  → router.push('/c/' + session.id)
  → App.vue watch $route → switchSession

Session 创建
  → router.push('/c/' + newSession.id)
```

### 兜底策略

1. 优先使用 URL 参数中的 session ID
2. 无效则读 localStorage 中的 `activeSessionId`
3. 仍无效则选 session 列表第一个
4. 列表为空则新建

## 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/router/index.ts` | 新建 | 路由定义、路由守卫 |
| `src/main.ts` | 修改 | `app.use(router)` |
| `src/App.vue` | 修改 | `<router-view>` 替代硬编码组件，删除 `onMounted` session 恢复 |
| `src/components/Sidebar.vue` | 修改 | session 点击 → `router.push`，Settings 按钮 → 路由跳转 |
| `src/components/SettingsBtn.vue` | 修改 | 弹窗 → 路由导航 |
| `src/components/settings/SettingsView.vue` | 修改 | `emit('close')` → `router.back()`，tab 由 URL param 驱动 |
| `src/components/ChatView.vue` | 新建 | ChatArea + 可选 SidePanel 的 wrapper |
| `src/components/NotFound.vue` | 新建 | 404 页面 |

## 不变的部分

- `ChatArea.vue` — 内部逻辑不变
- `SidePanel.vue` — 内部逻辑不变
- `chatStore` — `switchSession`、`createSession` 等 API 不变
- `localStorage` 持久化 — 保留作为兜底
