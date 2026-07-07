# Electron 桌面打包实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为弈 (Yi-Lin) 添加 Electron 桌面壳，支持跨平台分发与自动更新

**Architecture:** 新增 `apps/desktop/` 包，Electron 主进程启动时 fork server 子进程（`ELECTRON_RUN_AS_NODE=1`），健康检查通过后创建 BrowserWindow 加载前端构建产物。使用 `electron-updater` 通过 GitHub Releases 实现自动更新。

**Tech Stack:** Electron 33+, electron-builder, electron-updater, TypeScript

## Global Constraints

- 不修改 `apps/server/` 和 `apps/client/` 的现有代码
- server 作为 extraResource 打包，不放入 asar
- 开发模式：Electron 加载 `localhost:5173`，server 由开发者独立启动
- 生产模式：Electron 自动 fork 编译后的 server
- 更新使用 GitHub Releases + electron-updater，预留国内 OSS 源

---

### Task 1: 初始化 apps/desktop 包

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/.gitignore`

**Interfaces:**
- Produces: 基础包结构，后续任务通过 npm 安装依赖并添加源码文件

- [ ] **创建 apps/desktop/package.json**

```json
{
  "name": "yi-lin-desktop",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "dev": "electron .",
    "build": "node scripts/copy-server.js && electron-builder",
    "release": "node scripts/copy-server.js && electron-builder --publish always"
  },
  "dependencies": {
    "electron-updater": "^6.3"
  },
  "devDependencies": {
    "electron": "^33.0",
    "electron-builder": "^25.0",
    "typescript": "^5.6"
  }
}
```

- [ ] **创建 apps/desktop/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **创建 apps/desktop/.gitignore**

```
dist/
release/
resources/server/
```

- [ ] **安装依赖**

Run in `apps/desktop/`:
```bash
npm install
```

---

### Task 2: Electron 主进程 (main.ts)

**Files:**
- Create: `apps/desktop/src/main.ts`

**Interfaces:**
- Produces: `main.ts` — Electron 主进程入口，导出无函数，直接启动 app lifecycle
- Produces: fork server 子进程（startServer），健康检查后创建窗口
- Consumes: `preload.ts`（编译后 `dist/preload.js`）
- Consumes: `updater.ts`（编译后 `dist/updater.js`，调用 checkForUpdates）

- [ ] **创建 apps/desktop/src/main.ts**

```typescript
import { app, BrowserWindow } from 'electron'
import { fork, ChildProcess } from 'child_process'
import path from 'path'
import { checkForUpdates } from './updater'

let serverProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null

const isDev = !app.isPackaged

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDev) {
      resolve()
      return
    }

    const serverEntry = path.join(process.resourcesPath, 'server', 'dist', 'index.js')

    serverProcess = fork(serverEntry, [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: '3001' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverProcess.stdout?.on('data', (data) => console.log(`[server] ${data}`))
    serverProcess.stderr?.on('data', (data) => console.error(`[server] ${data}`))

    const startTime = Date.now()
    const check = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3001/health')
        if (res.ok) {
          clearInterval(check)
          resolve()
        }
      } catch {
        // server not ready yet
      }
      if (Date.now() - startTime > 20000) {
        clearInterval(check)
        reject(new Error('Server startup timeout after 20s'))
      }
    }, 300)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../client/dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  try {
    await startServer()
  } catch (err) {
    console.error('Failed to start server:', err)
    app.quit()
    return
  }

  createWindow()
  checkForUpdates(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill()
  }
})
```

---

### Task 3: Preload 脚本 (preload.ts)

**Files:**
- Create: `apps/desktop/src/preload.ts`

**Interfaces:**
- Produces: `preload.ts` — 通过 contextBridge 暴露版本号和更新信息到渲染进程
- Consumes: `electron` 原生模块
- Produces API: `window.electronAPI.version: string`, `window.electronAPI.updateStatus: string`, `window.electronAPI.onUpdateStatus(cb)`

- [ ] **创建 apps/desktop/src/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  version: process.env.npm_package_version || '',
  platform: process.platform,
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('update-status', (_event, status: string) => callback(status))
  },
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
})
```

---

### Task 4: 自动更新模块 (updater.ts)

**Files:**
- Create: `apps/desktop/src/updater.ts`

**Interfaces:**
- Produces: `checkForUpdates(win: BrowserWindow)` — 检查更新并通过 IPC 通知渲染进程
- Consumes: `electron-updater` 的 `autoUpdater`
- Consumes: `BrowserWindow` — 通过 `win.webContents.send` 发送更新状态

- [ ] **创建 apps/desktop/src/updater.ts**

```typescript
import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export function checkForUpdates(win: BrowserWindow): void {
  autoUpdater.on('checking-for-update', () => {
    win.webContents.send('update-status', 'checking')
  })

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-status', `available:${info.version}`)
    autoUpdater.downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('update-status', 'up-to-date')
  })

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update-status', `downloading:${progress.percent.toFixed(1)}`)
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update-status', 'downloaded')
    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (err) => {
    win.webContents.send('update-status', `error:${err.message}`)
  })

  autoUpdater.checkForUpdates()
}
```

---

### Task 5: 构建流水线

**Files:**
- Create: `apps/desktop/scripts/copy-server.js`
- Create: `apps/desktop/electron-builder.yml`

**Interfaces:**
- Produces: `copy-server.js` — 构建时复制编译后的 server 到 resources/server
- Produces: `electron-builder.yml` — 打包配置，含 extraResources 和发布配置

- [ ] **创建 apps/desktop/scripts/copy-server.js**

```javascript
const { copyFileSync, cpSync, existsSync, rmSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { execSync } = require('child_process')

const root = resolve(__dirname, '..')
const serverRoot = resolve(root, '../server')
const dest = resolve(root, 'resources/server')

if (existsSync(dest)) rmSync(dest, { recursive: true })
mkdirSync(dest, { recursive: true })

const serverDist = resolve(serverRoot, 'dist')
if (!existsSync(serverDist)) {
  console.error('Server dist not found. Build server first: cd apps/server && npm run build')
  process.exit(1)
}

cpSync(serverDist, resolve(dest, 'dist'), { recursive: true })
copyFileSync(resolve(serverRoot, 'package.json'), resolve(dest, 'package.json'))
cpSync(resolve(serverRoot, 'node_modules'), resolve(dest, 'node_modules'), { recursive: true })

console.log('Rebuilding native modules for Electron...')
execSync('npx @electron/rebuild -f -w better-sqlite3', { cwd: dest, stdio: 'inherit' })

console.log('Server resources copied to', dest)
```

- [ ] **创建 apps/desktop/electron-builder.yml**

```yaml
appId: com.yi-lin.app
productName: 弈
copyright: Copyright © 2024

directories:
  output: release
  buildResources: resources

files:
  - dist/**/*

extraResources:
  - from: resources/server
    to: server
    filter:
      - "**/*"
      - "!node_modules/**/*.{h,c,cpp,o,node,map}"
      - "!node_modules/**/build/**"
      - "!node_modules/**/test/**"
      - "!node_modules/**/tests/**"
      - "!node_modules/**/.cache/**"

asar: true
asarUnpack:
  - "node_modules/electron-updater/**"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.png

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.png

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: resources/icon.png

publish:
  - provider: github
    owner: <your-github-username>
    repo: <your-repo-name>
    releaseType: release
  # - provider: generic
  #   url: https://your-oss.example.com/releases
  #   channel: latest
```

---

### Task 6: 验证构建与运行

- [ ] **编译 desktop TypeScript**

Run in `apps/desktop/`:
```bash
npx tsc
```

Expected: `dist/main.js`, `dist/preload.js`, `dist/updater.js` 生成

- [ ] **验证开发模式**

1. 终端1: `cd apps/server && npm run dev`
2. 终端2: `cd apps/client && npm run dev`
3. 终端3: `cd apps/desktop && npm run dev`

Expected: Electron 窗口打开，加载 Vite 页面，功能正常

- [ ] **验证生产构建**

Run in `apps/desktop/`:
```bash
npm run build
```

Expected: `release/` 目录生成安装包，`resources/server/` 包含编译后的 server

- [ ] **提交代码**

```bash
git add apps/desktop/
git add docs/superpowers/
git commit -m "feat: add Electron desktop shell with auto-update"
```

---

## 发布流程

后续发版时：

```bash
# 1. 更新版本号 (server/client/desktop 同步)
# 2. 构建 client
cd apps/client && npm run build
# 3. 构建 server
cd apps/server && npm run build
# 4. 打桌面包并发布
cd apps/desktop && npm run release
# 5. electron-builder 自动上传到 GitHub Releases
```
