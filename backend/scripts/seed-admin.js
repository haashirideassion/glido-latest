/**
 * Seed the admin user for local development.
 * Run with: node scripts/seed-admin.js
 *
 * Requires DATABASE_URL in .env (or set it inline below)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function seed() {
  const email    = 'admin@glido.com'
  const password = 'admin123'
  const name     = 'Admin User'
  const role     = 'reception_admin'

  const hash = await bcrypt.hash(password, 12)

  await pool.query(`
    INSERT INTO app_users (email, name, role, password_hash)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          name          = EXCLUDED.name,
          role          = EXCLUDED.role,
          updated_at    = NOW()
  `, [email, name, role, hash])

  console.log(`✓ Upserted user: ${email} / ${password} (role: ${role})`)
  await pool.end()
}

seed().catch(err => { console.error(err); process.exit(1) })
