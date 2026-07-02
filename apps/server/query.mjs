import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, 'data/sessions.db'));
db.pragma('journal_mode = WAL');

const sid = 'mr2pykuoxpke20';
const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
console.log('=== SESSION ===');
console.log(JSON.stringify(session, null, 2));

const msgs = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(sid);
console.log('\n=== MESSAGES (' + msgs.length + ') ===');
for (const m of msgs) {
  const row = { ...m };
  if (row.content && row.content.length > 300) row.content = row.content.substring(0, 300) + '...';
  if (row.tool_input && row.tool_input.length > 200) row.tool_input = row.tool_input.substring(0, 200) + '...';
  if (row.tool_output && row.tool_output.length > 200) row.tool_output = row.tool_output.substring(0, 200) + '...';
  console.log(JSON.stringify(row));
}
