// Imported first so DATABASE_URL is set before ../src/db reads it.
const DB = process.env.TEST_DATABASE_URL
if (!DB || !/\/[^/?]*test[^/?]*(\?|$)/i.test(DB)) {
  console.error('Set TEST_DATABASE_URL to a database whose name contains "test" — these tests wipe the pu_* tables.')
  process.exit(2)
}
process.env.DATABASE_URL = DB
process.env.JWT_SECRET = 'testsecret'
