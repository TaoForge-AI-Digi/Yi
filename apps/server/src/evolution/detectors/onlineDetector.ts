export interface InsightEvent {
  type: 'high_frequency' | 'self_correction' | 'repeated_pattern'
  confidence: number
  description: string
  session_id: string
  agent_id: string
}

export interface ToolCallRecord {
  toolName: string
  hasError: boolean
  error?: string
  args?: string
}

export function detectInsight(toolCallHistory: ToolCallRecord[], sessionId: string, agentId: string): InsightEvent | null {
  if (toolCallHistory.length < 4) return null

  const recent = toolCallHistory.slice(-8)
  const names = recent.map(r => r.toolName)

  const errorRate = recent.filter(r => r.hasError).length / recent.length
  if (errorRate > 0.5) {
    return {
      type: 'self_correction',
      confidence: Math.min(errorRate, 0.95),
      description: `High error rate (${(errorRate * 100).toFixed(0)}%) in recent tool calls, suggesting exploratory behavior`,
      session_id: sessionId,
      agent_id: agentId,
    }
  }

  if (detectRepeatingPattern(names, 3)) {
    return {
      type: 'repeated_pattern',
      confidence: 0.7,
      description: `Repeating tool pattern detected: ${names.slice(0, 4).join(' -> ')}`,
      session_id: sessionId,
      agent_id: agentId,
    }
  }

  if (names.length >= 6) {
    const set = new Set(names)
    if (set.size <= 2) {
      return {
        type: 'high_frequency',
        confidence: 0.6,
        description: `High frequency usage of ${[...set].join(', ')} (${names.length} calls)`,
        session_id: sessionId,
        agent_id: agentId,
      }
    }
  }

  return null
}

function detectRepeatingPattern(names: string[], minRepeat: number): boolean {
  for (let len = 2; len <= Math.floor(names.length / 2); len++) {
    const pattern = names.slice(0, len)
    let matches = 0
    for (let i = 0; i <= names.length - len; i += len) {
      if (names.slice(i, i + len).every((n, j) => n === pattern[j])) {
        matches++
      }
    }
    if (matches >= minRepeat) return true
  }
  return false
}
