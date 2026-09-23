/**
 * Applies a single migration file from backend/migrations.
 *
 *   npm run migrate 041_vessel_fr_fields.sql
 *
 * Reuses src/db's pool, so it picks up DATABASE_URL and the SSL handling from .env exactly as the
 * server does — no separate connection string to keep in sync.
 *
 * The whole file runs inside one transaction. Postgres makes DDL transactional, so a statement
 * failing half way leaves the schema untouched rather than partially migrated.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { pool } from '../src/db'

async function main() {
  const name = process.argv[2]
  if (!name) {
    console.error('Usage: npm run migrate <filename.sql>')
    console.error('Example: npm run migrate 041_vessel_fr_fields.sql')
    process.exit(1)
  }

  // Resolved against the working directory, so this must be run from backend/.
  const path = resolve(process.cwd(), 'migrations', name)
  if (!existsSync(path)) {
    console.error(`Migration not found: ${path}`)
    console.error('Run this from the backend directory.')
    process.exit(1)
  }

  const sql = readFileSync(path, 'utf8')
  const client = await pool.connect()
  try {
    console.log(`Applying ${name}…`)
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log(`✓ ${name} applied`)
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`✗ ${name} failed — nothing was changed`)
    console.error(err?.message ?? err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
