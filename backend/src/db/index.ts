import { Pool, types } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// Return DATE columns as plain strings (YYYY-MM-DD) instead of JS Date objects.
// Without this, node-postgres serialises DATE → ISO timestamp with UTC offset,
// causing 2026-06-22 to appear as 2026-06-21T18:30:00.000Z in Sydney (UTC+10).
types.setTypeParser(1082, (val: string) => val)

// The hosted database requires SSL, so it stays on by default. A local
// Postgres (dev, or the migration/rating checks in scripts/) does not support
// it at all and fails to connect, so PGSSLMODE=disable opts out.
const sslDisabled = process.env.PGSSLMODE === 'disable'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err)
})
