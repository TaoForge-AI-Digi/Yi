import type { ToolModule } from '../types.js'

export const tool: ToolModule = {
  name: 'task_complete',
  description: '标记当前任务已完成，结束本轮会话循环。调用时附带最终结果的摘要说明。',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '任务完成摘要' },
    },
    required: ['summary'],
  },
  dangerous: false,
  execute: async () => {
    return { output: '', error: 'task_complete is handled at loop level' }
  },
}
