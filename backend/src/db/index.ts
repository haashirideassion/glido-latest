import { Pool, types } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// Return DATE columns as plain strings (YYYY-MM-DD) instead of JS Date objects.
// Without this, node-postgres serialises DATE → ISO timestamp with UTC offset,
// causing 2026-06-22 to appear as 2026-06-21T18:30:00.000Z in Sydney (UTC+10).
types.setTypeParser(1082, (val: string) => val)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err)
})
