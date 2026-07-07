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
