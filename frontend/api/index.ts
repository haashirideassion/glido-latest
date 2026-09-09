import { Hono } from 'hono'
import { handle } from '@hono/node-server/vercel'
import { portalRoutes } from '../src/routes/portal'
import { receptionRoutes } from '../src/routes/reception'
import { kioskRoutes } from '../src/routes/kiosk'

const app = new Hono()

app.onError((err, c) => {
  console.error('[glido] unhandled error:', err)
  return c.html('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#44403C"><h2>Something went wrong</h2><p>Please try refreshing the page.</p></body></html>', 500)
})

app.route('/', portalRoutes)
app.route('/reception', receptionRoutes)
app.route('/kiosk', kioskRoutes)

export default handle(app)
