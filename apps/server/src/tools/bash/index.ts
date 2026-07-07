import { spawn } from 'child_process'
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs'
import { resolve as pathResolve } from 'path'
import type { ToolModule } from '../types.js'
import { assertPathSafe } from '../utils.js'

const WIN_ABS_PATH_RE = /[A-Za-z]:\\[^\s"'|&;<>(){}[\]`~!@#$%^&*=+]+/g

// Match path-like tokens: absolute paths, parent traversal, home dir, or paths containing separator
// Respects single/double quotes
const PATH_TOKEN_RE = /(?:^|\s+)((?:~\/|\.\.\/|\/|[A-Za-z]:\\)[\S]*)/g
const QUOTED_PATH_RE = /["']((?:~\/|\.\.\/|\/|[A-Za-z]:\\)[^"']*)["']/g

function scanCommandPaths(cmd: string, workspaces: string[], allowedRoots?: string[]): void {
  // Check quoted paths first (handles paths with spaces)
  let m: RegExpExecArray | null
  QUOTED_PATH_RE.lastIndex = 0
  while ((m = QUOTED_PATH_RE.exec(cmd)) !== null) {
    assertPathSafe(m[1], workspaces, allowedRoots)
  }
  // Check unquoted path-like tokens
  PATH_TOKEN_RE.lastIndex = 0
  while ((m = PATH_TOKEN_RE.exec(cmd)) !== null) {
    const p = m[1]
    if (p.includes('=') || p.startsWith('-')) continue  // skip flags and assignments
    // Skip if inside quotes (already handled above)
    const before = cmd.slice(0, m.index)
    const quotes = (before.match(/["']/g) || []).length
    if (quotes % 2 !== 0) continue
    assertPathSafe(p, workspaces, allowedRoots)
  }
}
const MAX_OUTPUT = 1024 * 1024
const TAIL_SIZE = 50 * 1024
const TIMEOUT_MS = 60000
const FORCE_KILL_MS = 3000

const TEMP_DIR = pathResolve(process.cwd(), '.bash-output')

function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true })
}

function twoStageKill(child: import('child_process').ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.killed) return
  child.kill(signal)
  if (FORCE_KILL_MS > 0) {
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL')
    }, FORCE_KILL_MS)
  }
}

export const tool: ToolModule = {
  name: 'bash',
  description: 'Execute a shell command in the workspace directory',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: 'Shell command to execute' } },
    required: ['command'],
  },
  dangerous: true,
  execute: async (args, { workspace, workspaces, signal, allowedRoots, onOutput }) => {
    const cmd = args.command || ''
    const roots = workspaces ?? [workspace]
    // Scan for path-like tokens and validate against workspaces
    scanCommandPaths(cmd, roots, allowedRoots)
    // Also check Windows absolute paths (legacy)
    const absPaths = cmd.match(WIN_ABS_PATH_RE)
    if (absPaths) {
      for (const raw of absPaths) {
        assertPathSafe(raw, roots, allowedRoots)
      }
    }

    return new Promise((resolvePromise) => {
      const child = spawn(cmd, [], {
        shell: true,
        cwd: workspace,
        windowsHide: true,
      })

      let stdout = ''
      let stderr = ''
      let truncated = false
      let writtenOnce = false

      const timeoutId = setTimeout(() => {
        const msg = '\n[Timeout: command exceeded 60000ms]'
        stderr += msg
        onOutput?.(msg)
        twoStageKill(child)
      }, TIMEOUT_MS)

      const abortHandler = () => {
        clearTimeout(timeoutId)
        const msg = '\n[Aborted]'
        stderr += msg
        onOutput?.(msg)
        twoStageKill(child)
      }
      signal?.addEventListener('abort', abortHandler, { once: true })
      if (signal?.aborted) abortHandler()

      function ensureOutputFile(stdoutFull: string, stderrFull: string): string | null {
        ensureTempDir()
        const name = `bash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.log`
        const filePath = pathResolve(TEMP_DIR, name)
        try {
          writeFileSync(filePath, stdoutFull)
          if (stderrFull) appendFileSync(filePath, `\n${stderrFull}`)
          writtenOnce = true
          return filePath
        } catch {
          return null
        }
      }

      function appendOutput(buf: Buffer, isStdout: boolean) {
        const chunk = buf.toString()
        const target = isStdout ? stdout : stderr

        if (truncated) {
          onOutput?.(chunk)
          return
        }

        const nextLen = target.length + chunk.length
        if (nextLen > MAX_OUTPUT) {
          const fullBefore = (isStdout ? stdout : stderr) + chunk
          const other = isStdout ? stderr : stdout

          const filePath = ensureOutputFile(
            isStdout ? fullBefore : stdout,
            isStdout ? stderr : fullBefore,
          )
          const pathNote = filePath ? ` (saved: ${filePath})` : ''

          const msg = `\n[Output exceeds 1MB, showing last 50KB${pathNote}]`
          truncated = true

          if (isStdout) {
            stdout = fullBefore.slice(-TAIL_SIZE) + msg
          } else {
            stderr = fullBefore.slice(-TAIL_SIZE) + msg
          }
          onOutput?.(chunk)
          onOutput?.(msg)
          return
        }

        if (isStdout) stdout += chunk
        else stderr += chunk
        onOutput?.(chunk)
      }

      child.stdout.on('data', (data: Buffer) => appendOutput(data, true))
      child.stderr.on('data', (data: Buffer) => appendOutput(data, false))

      child.on('error', (err: Error) => {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)
        resolvePromise({ output: stdout, error: err.message })
      })

      child.on('close', (code) => {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)
        const combined = stdout + (stderr ? `\n${stderr}` : '')
        if (code === 0 || (code === null && stdout)) {
          resolvePromise({ output: combined.trim() })
        } else {
          resolvePromise({ output: stdout.trim(), error: stderr.trim() || `Exit code: ${code}` })
        }
      })
    })
  },
}
