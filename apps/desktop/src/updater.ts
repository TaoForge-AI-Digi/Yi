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

  autoUpdater.checkForUpdates().catch((err: any) => {
    console.error('Update check failed:', err.message)
  })
}
