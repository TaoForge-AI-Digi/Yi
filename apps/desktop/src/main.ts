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
