import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  version: process.env.npm_package_version || '',
  platform: process.platform,
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('update-status', (_event, status: string) => callback(status))
  },
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
})
