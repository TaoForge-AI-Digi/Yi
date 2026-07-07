# Electron 桌面打包方案设计

## 概述

为弈 (Yi-Lin) 项目添加 Electron 桌面壳，将其包装为跨平台桌面应用，支持 Windows/macOS/Linux 分发与自动更新。

## 架构

```
Electron App
├── Main Process (main.ts)
│   - 启动时 fork 子进程运行 server
│   - 健康检查 (GET /health) 通过后创建 BrowserWindow
│   - 退出时 kill 子进程
├── Server Child Process
│   - Electron 自带的 Node.js 运行时 (process.execPath)
│   - 无窗口后台运行 (windowsHide / detached)
│   - Hono + Socket.IO + SQLite (现有 server 代码编译后作为 extraResource)
├── BrowserWindow
│   - 生产: 加载 file://apps/client/dist/index.html
│   - 开发: 加载 http://localhost:5173 (Vite dev server)
└── Preload Script (preload.ts)
    - contextBridge 暴露版本号/更新状态到渲染进程
```

关键点:
- Server 不直接引入 Electron 包，而是编译后作为 `extraResource` 打进去
- Electron 主进程用 `fork()` 启动 server，通过 Electron 自身 Node.js 运行
- 通信走 `127.0.0.1:3001`，不受系统代理影响

## 目录结构

现有 server/client 不修改。新增 `apps/desktop/`:

```
apps/desktop/
├── package.json
├── tsconfig.json
├── electron-builder.yml      # 打包配置
├── src/
│   ├── main.ts               # Electron 主进程入口
│   ├── preload.ts            # contextBridge 预加载
│   └── updater.ts            # 自动更新逻辑
├── resources/
│   └── icon.png              # 应用图标 (多尺寸)
└── scripts/
    └── copy-server.js        # 构建后复制 server dist 到资源目录
```

## 更新机制

### 架构

- 基于 `electron-updater` (GitHub Releases provider)
- 全量更新：Electron + 前端 build + server dist 统一打包
- 启动时后台检查更新，静默下载，下次重启时安装

### 国内源预留

`electron-builder.yml` 配置 `publish` 主源为 GitHub，额外保留注释的 OSS 备用配置：

```yaml
publish:
  - provider: github
    owner: <owner>
    repo: <repo>
  # - provider: generic
  #   url: https://your-oss.example.com/releases
  #   channel: latest
```

用户或 CI 切换时只需取消注释 + 改 URL，不需要改代码。

## 原生依赖

`better-sqlite3` 需要 `electron-rebuild` 编译为 Electron ABI 版本。electron-builder 自动处理。

## 构建与发布

```
# 开发
apps/desktop> npm run dev       # 启动 Electron 窗口，前端走 Vite HMR

# 打包
apps/desktop> npm run build     # 构建前端 + 编译 server + electron-builder

# 发布
apps/desktop> npm run release   # 构建 + 上传 GitHub Releases
```

## 开发体验

三个终端并行:

| 终端 | 区域 | 命令 |
|------|------|------|
| 1 | apps/server | `npm run dev` |
| 2 | apps/client | `npm run dev` |
| 3 | apps/desktop | `npm run dev` |

前端改代码即时 HMR，和纯 web 开发一致。

## 打包输出

| 平台 | 格式 | 备注 |
|------|------|------|
| Windows | `.exe` (NSIS 安装包) | 可选便携版 |
| macOS | `.dmg` | 需 Apple 开发者签名 |
| Linux | `.AppImage` | |

## 不支持的范围

- 不提供 iOS / Android / Web 端
- 不替换现有的 web 使用方式 (server + 浏览器仍可独立用)
