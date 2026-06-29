# Chat View 优化设计文档

> 基于 Yi-agent-studio 参考文档，优化当前聊天界面

---

## 1. 背景与目标

### 1.1 当前状态

当前项目是一个基于 Vue 3 + Vite 的聊天应用，包含以下基础功能：
- 侧边栏：会话列表、新建对话、设置按钮
- 聊天区域：配置栏、消息列表、输入框
- 消息显示：用户消息、助手消息、工具消息
- 基本交互：发送消息、停止生成

### 1.2 优化目标

参考 `Yi-agent-studio` 的 ChatView 页面，实现以下功能：
1. 侧边栏增强：搜索、分组、右键菜单、批量操作
2. 消息增强：思考过程、工具详情、附件、语音、复制
3. 输入框增强：工具栏、附件、Slash命令、语音
4. 面板功能：文件面板、终端面板、大纲面板
5. Markdown增强：代码高亮、LaTeX、Mermaid、表格

### 1.3 设计原则

- **渐进式增强**：分阶段实施，确保每个阶段可独立运行
- **功能对齐**：优先实现参考文档中的核心功能
- **用户体验**：保持界面简洁，避免功能堆砌
- **可维护性**：组件化设计，便于后续扩展

---

## 2. 分阶段实施计划

### 阶段1：侧边栏完整开发（2-3周）

#### 2.1.1 侧边栏功能

**功能清单：**
- [x] 搜索框：实时过滤会话列表
- [x] 工作区分组：按工作区自动分组显示
- [x] 工作区折叠/展开：点击工作区名称折叠或展开
- [x] 工作区内新建对话：点击工作区旁边的"+"按钮直接在该工作区下新建对话
- [x] 会话收藏：⭐ 收藏重要会话
- [x] 会话管理：右键菜单（收藏、重命名、复制ID、导出、删除）
- [x] 批量操作：多选会话、批量删除
- [x] 会话导出：导出为 JSON

**组件设计：**
```
Sidebar.vue
├── SearchBar.vue              # 搜索框
├── FilterBar.vue              # 过滤/排序按钮栏
├── WorkspaceGroup.vue         # 工作区分组（可折叠）
│   ├── WorkspaceHeader.vue    # 工作区标题（含+按钮）
│   └── SessionItem.vue        # 单个会话（含圆点状态指示器）
├── ContextMenu.vue            # 右键菜单
├── BatchActions.vue           # 批量操作栏
├── ExportModal.vue            # 导出弹窗
└── SettingsBtn.vue
```

**数据结构扩展：**
```typescript
interface Session {
  // 现有字段...
  pinned: boolean          // 是否置顶
  workspace?: string       // 工作区
  updatedAt: number        // 更新时间
}

interface WorkspaceGroup {
  name: string             // 工作区名称
  sessions: Session[]      // 该工作区下的会话列表
  collapsed: boolean       // 是否折叠
}
```

**右键菜单项：**
```typescript
const contextMenuItems = [
  { label: '置顶', key: 'pin' },
  { label: '重命名', key: 'rename' },
  { label: '设置工作区', key: 'workspace' },
  { label: '切换模型', key: 'model' },
  { label: '复制链接', key: 'copy-link' },
  { label: '复制 ID', key: 'copy-id' },
  { label: '导出', key: 'export' },
  { label: '删除', key: 'delete', danger: true },
]
```

**分组显示结构：**
```
┌─────────────────────────────────┐
│ low-code-platform  v     +    │
│   ○ General coding session      │
│                                 │
│ ppt                   v     +  │
│   ○ 安装understand anything     │
│   ○ 安装superpowers            │
│                                 │
│ TaoForge-Studio             +    │
│   ○ understand TaoForge         │
└─────────────────────────────────┘
```

---

### 阶段2：消息、输入框与Markdown增强（2-3周）

#### 2.2.1 消息功能

**功能清单：**
- [x] 消息复制按钮：一键复制消息内容
- [x] 工具消息展开/折叠：查看工具调用详情
- [x] 流式指示器优化：显示思考状态
- [x] 消息时间戳：显示发送时间
- [x] 思考过程显示：显示 AI 思考过程
- [ ] 附件预览：图片、文件预览
- [ ] 语音播放按钮：播放消息语音
- [ ] Fork 对话：从当前消息分叉对话

**组件设计：**
```
MessageItem.vue（增强）
├── CopyButton.vue        # 复制按钮
├── ToolDetail.vue        # 工具详情展开
├── StreamingIndicator.vue # 流式指示器
├── Timestamp.vue         # 时间戳
├── ThinkingBlock.vue     # 思考过程显示
├── AttachmentPreview.vue # 附件预览
├── SpeechButton.vue      # 语音播放
└── ForkButton.vue        # Fork 按钮
```

**思考过程显示结构：**
```
┌─────────────────────────────────┐
│ 💭 思考过程 [2.3s] [425 chars]  │
│ [▶ 展开/折叠]                   │
├─────────────────────────────────┤
│ 让我分析这个问题...             │
│ 首先需要理解...                 │
└─────────────────────────────────┘
```

#### 2.2.2 面板功能

**功能清单：**
- [ ] 文件面板：浏览目录、读取文件、新建文件/文件夹、上传文件
- [ ] 大纲面板：提取消息标题、点击跳转
- [ ] 面板切换：顶栏 toggle 按钮

**组件设计：**
```
ChatArea.vue（增强）
├── ConfigBar.vue
├── MessageList.vue
├── ChatInput.vue
├── PanelToggle.vue       # 面板切换按钮
└── SidePanel.vue         # 侧边面板容器
    ├── FilesPanel.vue    # 文件面板
    └── OutlinePanel.vue  # 大纲面板
```

#### 2.2.3 输入框功能

**功能清单：**
- [x] 顶部工具栏：Character、模型选择、Provider、推理强度
- [ ] 附件上传按钮：支持文件上传
- [x] 发送按钮优化：加载状态、快捷键提示
- [x] 输入框自动高度 + 手动拖拽

**组件设计：**
```
ChatInput.vue（增强）
├── InputToolbar.vue      # 顶部工具栏
│   ├── CharacterSelector.vue
│   ├── ModelSelector.vue
│   └── AttachButton.vue
├── Textarea.vue          # 输入框（增强）
└── SendButton.vue        # 发送按钮（增强）
```

#### 2.2.4 Markdown功能

**功能清单：**
- [ ] 代码块高亮：使用 highlight.js
- [ ] 链接点击优化：新窗口打开
- [ ] 表格渲染
- [ ] 图片点击预览

**依赖添加：**
```bash
npm install highlight.js markdown-it
```

---

### 阶段3：完整功能（3-4周）

#### 2.3.1 终端与高级Markdown

**功能清单：**
- [ ] WebSocket 终端连接
- [ ] 多终端管理
- [ ] 终端主题切换
- [ ] 终端输入/输出
- [ ] LaTeX 公式渲染
- [ ] Mermaid 图表渲染
- [ ] 表格增强
- [ ] 本地文件链接转换

**技术实现：**
- 使用 xterm.js 实现终端 UI
- WebSocket 连接后端终端服务
- 支持多终端会话管理

**依赖添加：**
```bash
npm install xterm xterm-addon-fit xterm-addon-web-links katex mermaid markdown-it-katex
```

#### 2.3.2 命令功能

**功能清单：**
- [x] 上下文编辑：编辑用户消息 + 删除任意消息
- [ ] Slash 命令：快捷命令

---

## 3. 技术架构

### 3.1 组件结构

```
src/
├── components/
│   ├── Sidebar/              # 侧边栏组件
│   │   ├── SearchBar.vue
│   │   ├── FilterBar.vue
│   │   ├── WorkspaceGroup.vue
│   │   ├── WorkspaceHeader.vue
│   │   ├── SessionItem.vue
│   │   ├── ContextMenu.vue
│   │   └── BatchActions.vue
│   ├── Chat/                 # 聊天组件
│   │   ├── ChatArea.vue
│   │   ├── ConfigBar.vue
│   │   ├── MessageList.vue
│   │   ├── MessageItem.vue
│   │   ├── ChatInput.vue
│   │   └── InputToolbar.vue
│   ├── Panels/               # 面板组件
│   │   ├── SidePanel.vue
│   │   ├── FilesPanel.vue
│   │   ├── TerminalPanel.vue
│   │   └── OutlinePanel.vue
│   ├── Markdown/             # Markdown 渲染
│   │   ├── MarkdownRenderer.vue
│   │   ├── CodeBlock.vue
│   │   ├── LaTeXBlock.vue
│   │   └── MermaidBlock.vue
│   └── Common/               # 通用组件
│       ├── Modal.vue
│       ├── Dropdown.vue
│       └── Tooltip.vue
├── stores/                   # 状态管理
│   ├── chat.ts
│   ├── sessions.ts
│   ├── files.ts
│   └── settings.ts
├── api/                      # API 接口
│   ├── sessions.ts
│   ├── files.ts
│   └── terminal.ts
└── utils/                    # 工具函数
    ├── markdown.ts
    └── format.ts
```

### 3.2 状态管理

**Chat Store 扩展：**
```typescript
interface ChatStore {
  // 现有状态...
  sessions: Session[]
  activeSessionId: string | null
  
  // 新增状态
  sidebarSearch: string
  isBatchMode: boolean
  selectedSessionIds: Set<string>
  collapsedWorkspaces: Set<string>  // 折叠的工作区集合
  
  // 新增 computed
  workspaceGroups: WorkspaceGroup[]  // 按工作区分组的会话列表
  
  // 新增 actions
  toggleSessionPin: (id: string) => void
  renameSession: (id: string, title: string) => void
  setSessionWorkspace: (id: string, workspace: string) => void
  batchDeleteSessions: (ids: string[]) => void
  exportSession: (id: string, format: 'json' | 'txt') => void
  toggleWorkspaceCollapse: (workspace: string) => void
  createSessionInWorkspace: (workspace: string) => void
}
```

### 3.3 API 接口

**新增接口：**
```typescript
// 会话管理
PUT /sessions/:id/rename
PUT /sessions/:id/workspace
PUT /sessions/:id/model
DELETE /sessions/:id
POST /sessions/batch-delete
GET /sessions/:id/export

// 文件管理
GET /files/list
GET /files/read
PUT /files/write
POST /files/mkdir
POST /files/rename
DELETE /files/delete
POST /files/upload
GET /download

// 终端
WebSocket /api/yi/terminal
```

---

## 4. 样式设计

### 4.1 设计规范

- **主色调**：#007aff（蓝色）
- **背景色**：#f8f9fa（浅灰）
- **边框色**：#e0e0e0
- **字体**：系统默认字体
- **圆角**：6px-12px

### 4.2 响应式设计

- **桌面端**：完整功能布局
- **平板端**：侧边栏可折叠
- **移动端**：底部导航，简化布局

---

## 5. 测试策略

### 5.1 单元测试

- 组件渲染测试
- 用户交互测试
- 状态管理测试

### 5.2 集成测试

- API 调用测试
- WebSocket 连接测试
- 文件上传测试

### 5.3 E2E 测试

- 完整用户流程测试
- 跨浏览器测试

---

## 6. 风险与缓解

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| WebSocket 连接不稳定 | 终端功能不可用 | 实现重连机制，降级为 HTTP |
| Markdown 渲染性能 | 大文档卡顿 | 使用虚拟滚动，分页加载 |
| 文件上传大小限制 | 大文件无法上传 | 分片上传，进度显示 |

### 6.2 进度风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 功能范围蔓延 | 延期交付 | 严格控制阶段范围，优先核心功能 |
| 依赖库兼容性 | 开发受阻 | 提前验证依赖，准备备选方案 |

---

## 7. 成功标准

### 7.1 功能标准

- [ ] 阶段1功能100%实现
- [ ] 阶段2功能100%实现
- [ ] 阶段3功能80%以上实现

### 7.2 质量标准

- [ ] 单元测试覆盖率 > 80%
- [ ] 无 P0/P1 级 bug
- [ ] 页面加载时间 < 2s
- [ ] 交互响应时间 < 100ms

### 7.3 用户体验标准

- [ ] 界面简洁美观
- [ ] 交互流畅自然
- [ ] 功能易于发现
- [ ] 错误提示清晰

---

## 8. 附录

### 8.1 参考文档

- `Yi-agent-studio/docs/CHAT_VIEW_FULL_SPEC.md`
- `2026-06-29-future-development-plan.md`（后续开发计划）
- Vue 3 官方文档
- Vite 官方文档

### 8.2 依赖清单

**阶段1：**
- 无新增依赖

**阶段2：**
- highlight.js
- markdown-it

**阶段3：**
- xterm
- xterm-addon-fit
- xterm-addon-web-links
- katex
- mermaid
- markdown-it-katex

### 8.3 开发工具

- VS Code + Volar 插件
- Vue DevTools
- Chrome DevTools
