const { copyFileSync, cpSync, existsSync, rmSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { execSync } = require('child_process')

const root = resolve(__dirname, '..')
const serverRoot = resolve(root, '../server')
const clientRoot = resolve(root, '../client')
const serverDest = resolve(root, 'resources/server')
const clientDest = resolve(root, 'resources/client')

// Copy server
if (existsSync(serverDest)) rmSync(serverDest, { recursive: true })
mkdirSync(serverDest, { recursive: true })

const serverDist = resolve(serverRoot, 'dist')
if (!existsSync(serverDist)) {
  console.error('Server dist not found. Build server first: cd apps/server && npm run build')
  process.exit(1)
}

cpSync(serverDist, resolve(serverDest, 'dist'), { recursive: true })
copyFileSync(resolve(serverRoot, 'package.json'), resolve(serverDest, 'package.json'))
cpSync(resolve(serverRoot, 'node_modules'), resolve(serverDest, 'node_modules'), { recursive: true })

console.log('Rebuilding native modules for Electron...')
execSync('npx @electron/rebuild -f -w better-sqlite3', { cwd: serverDest, stdio: 'inherit' })

console.log('Server resources copied to', serverDest)

// Copy client dist
const clientDist = resolve(clientRoot, 'dist')
if (!existsSync(clientDist)) {
  console.error('Client dist not found. Build client first: cd apps/client && npm run build')
  process.exit(1)
}

if (existsSync(clientDest)) rmSync(clientDest, { recursive: true })
mkdirSync(clientDest, { recursive: true })
cpSync(clientDist, resolve(clientDest, 'dist'), { recursive: true })
console.log('Client dist copied to', clientDest)
