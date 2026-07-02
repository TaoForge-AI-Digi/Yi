# Tool Filesystem Discovery + Per-Character Tool Selection

## Objective

Transform tools from a hardcoded code registry into filesystem-discoverable entities (same pattern as skills), with per-character tool selection and source tagging.

## Motivation

- Currently adding a new tool requires editing `registry.ts` (add import + array entry)
- Want "create a directory, write code, it just works" — same DX as skills
- Per-character tool selection enables tailoring agent capabilities per role

## Design

### Tool directory structure (no change to physical layout)

```
apps/server/src/tools/
├── read/
│   ├── tool.json          # metadata only
│   └── index.ts           # implementation: export const tool: ToolModule
├── write/
│   ├── tool.json
│   └── index.ts
├── bash/
│   ├── tool.json
│   └── index.ts
├── _template/             # reference for creating new tools
│   ├── tool.json
│   └── index.ts
```

Existing tools stay in place. Only `registry.ts` changes — from static imports to directory scanning.

### `tool.json` format

```json
{
  "name": "read",
  "description": "Read files from the workspace",
  "source": "builtin",
  "tags": ["filesystem"],
  "version": "1.0.0",
  "author": "Yi-Lin",
  "dangerous": false,
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "File path to read" }
    },
    "required": ["path"]
  }
}
```

- `source` field: `"builtin"` | `"mcp"` | `"external"` (for future use)
- API reads only `tool.json` for listing — zero-cost scanning
- Runtime lazy-imports `index.ts` only when the tool is actually called

### Server-side changes

| File | Change |
|------|--------|
| `apps/server/src/tools/registry.ts` | Static import list → directory scan + lazy-load map. Each tool dir's `index.ts` is loaded on first `getByName()` call, not at startup. |
| `apps/server/src/routes/tools.ts` | `GET /api/tools` reads `tool.json` from all tool dirs + MCP servers; returns flat list with source tags |
| `apps/server/src/tools/definitions.ts` | Already updated in previous pass to pass through non-registry (MCP/external) tools |
| Each tool dir | Add `tool.json` with metadata |

### Client-side changes (already done in previous pass)

| File | Change |
|------|--------|
| `apps/client/src/api/tools.ts` | `ToolMeta` with `source` field ✓ |
| `apps/client/src/stores/tools.ts` | `allTools` + computed `builtinTools` ✓ |
| `apps/client/src/components/settings/ToolBindingEditor.vue` | Dynamic `allTools` prop, source tag display ✓ |
| `apps/client/src/components/settings/RoleSettings.vue` | Fetch tools in `onMounted` ✓ |

### Tool loading strategy (inspired by Hermes)

Reference: `hermes-agent-main/tools/registry.py` — `discover_builtin_tools()`

Hermes handles hundreds of tools by:
1. Scanning the tools directory with **AST parsing** (not importing) to find files that contain `registry.register()` calls
2. Dynamically importing only those files; each self-registers on import

Our approach mirrors this with a simpler mechanism:

**API listing** — reads `tool.json` files only (JSON parse, zero cost):
```typescript
// Scan on startup, only read JSON metadata
const toolMetas: ToolMeta[] = []
for (const dir of scanToolDirs()) {
  const meta = JSON.parse(readFileSync(join(toolsDir, dir, 'tool.json')))
  toolMetas.push(meta)
}
```

**Runtime execution** — lazy import on first use:
```typescript
const toolLoaders = new Map<string, () => Promise<ToolModule>>()

// At startup: register lazy loaders only
for (const dir of scanToolDirs()) {
  const meta = JSON.parse(readFileSync(join(toolsDir, dir, 'tool.json')))
  toolLoaders.set(meta.name, () => import(`./${dir}/index.js`).then(m => m.tool))
}

// First call to a tool triggers the actual import
async function getByName(name: string): Promise<ToolModule | undefined> {
  const loader = toolLoaders.get(name)
  if (!loader) return undefined
  const tool = await loader()
  // Cache for subsequent calls
  toolLoaders.set(name, async () => tool)
  return tool
}
```

This means:
- Adding a new tool = create a directory with `tool.json` + `index.ts`
- No registry file to edit, no import lines to add
- Tools with many dependencies only load their code when actually called
- 10 or 1000 tools — startup time is always O(n) in file count (JSON reads), not import cost

## Non-goals

- Tool execution model stays identical (same `ToolModule` interface)
- No change to agent runtime, skill system, or MCP server management
- Character config `tools: ToolBinding[]` field stays unchanged
