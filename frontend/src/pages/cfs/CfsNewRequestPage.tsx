import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from '@/lib/toast'
import { useCfs } from '@/components/cfs/CfsContext'
import RequestForm from '@/components/cfs/RequestForm'
import { DIRECTION_TO_MODE, isMode, MODE_TO_DIRECTION } from '@/lib/cfs'

/** Staff: create a request on a customer's behalf. It lands in New Request, already accepted. */
export default function CfsNewRequestPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { refreshSummary, direction: ctxDirection } = useCfs()
  const qm = params.get('mode')
  const initial = isMode(qm) ? MODE_TO_DIRECTION[qm] : ctxDirection

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#1C1917' }}>Create request</h1>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--text-secondary)' }}>
        Enter a request on behalf of a customer (phone, email or walk-in). It goes straight to New Request as accepted.
      </p>
      <RequestForm staff initialDirection={initial}
        onCancel={() => navigate(-1)}
        onCreated={r => {
          toast(`Request ${r.request_ref} created`, 'success')
          r.warnings.forEach(w => toast(w, 'info'))
          refreshSummary()
          navigate(`/packing-unpacking/${DIRECTION_TO_MODE[r.direction]}/new`)
        }} />
    </div>
  )
}
