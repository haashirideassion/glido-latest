import { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { MyBookingsList } from '@/components/portal/MyBookingsList'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { getBookingByRef, getBookingsByUserId } from '@/lib/db/bookings'
import { useAuth } from '@/contexts/AuthContext'
import type { Booking } from '@/data/types'

const PAGE_SIZE = 10

const FIELD: React.CSSProperties = {
  flex: 1, padding: '10px 14px', fontSize: 15.5,
  border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none',
  boxSizing: 'border-box', background: '#fff', color: '#1C1917',
  transition: 'border-color 0.15s ease',
}


export default function MyBookingsPage() {
  usePageTitle('Glido | My Bookings')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const ref = params.get('ref')?.trim().toUpperCase() ?? ''

  const [bookings, setBookings]       = useState<Booking[]>([])
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState(ref)
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy]           = useState('date_desc')
  const [page, setPage]               = useState(1)

  useEffect(() => {
    if (!ref && !user) return
    setLoading(true)
    const fetch = ref
      ? getBookingByRef(ref).then(b => (b ? [b] : []))
      : user ? getBookingsByUserId(user.id) : Promise.resolve([])
    fetch
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setLoading(false))
  }, [ref, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) setParams({ ref: search.trim().toUpperCase() })
    else setParams({})
  }

  // Reset to page 1 when filters or sort change
  useEffect(() => { setPage(1) }, [statusFilter, sortBy])

  // Filter → sort → paginate
  const filtered = bookings.filter(b => !statusFilter || b.status === statusFilter)
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'date_asc')  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    if (sortBy === 'status')    return (a.status ?? '').localeCompare(b.status ?? '')
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') // date_desc — newest created first
  })
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Not logged in, no search ──
  if (!user && !ref) {
    return (
      <div style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Icon name={ICONS.bookings} size={24} style={{ color: 'var(--brand-color)' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', marginBottom: 8 }}>
            Sign in to view your bookings
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 28, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
            Log in to see your full booking history, or search by reference number below.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            <Link to="/visitor-login" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 24px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', borderRadius: 'var(--r-full)', textDecoration: 'none', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)' }}>
              <Icon name={ICONS.user} size={15} /> Sign In <Icon name={ICONS.arrowRight} size={14} />
            </Link>
            <Link to="/book" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', textDecoration: 'none' }}>
              <Icon name={ICONS.calendar} size={14} /> Book a New Visit
            </Link>
          </div>

          <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 24 }}>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 12 }}>Have a reference number? Look it up directly:</p>
            <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="GLD-2026-10142"
                style={{ ...FIELD, fontFamily: 'ui-monospace,monospace' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(0,0,0,0.12)')}
              />
              <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Icon name={ICONS.search} size={14} /> Search
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Logged in or searching ──
  return (
    <div style={{ padding: '40px 24px 64px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', marginBottom: 4 }}>My Bookings</h1>
          <p style={{ fontSize: 15, color: '#64748B' }}>Track the status of your depot slot bookings.</p>
        </div>

        {/* Search bar */}
        <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="e.g. GLD-2026-10142"
            style={{ ...FIELD, fontFamily: search ? 'ui-monospace,monospace' : undefined }}
            onFocus={e => (e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)')}
            onBlur={e  => (e.target.style.borderColor = 'rgba(0,0,0,0.12)')}
          />
          <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Search
          </button>
          {ref && (
            <button type="button" onClick={() => { setSearch(''); setParams({}) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Clear
            </button>
          )}
        </form>

        {/* Filter + sort row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <CustomSelect
            placeholder="All Statuses"
            value={statusFilter}
            onChange={setStatusFilter}
            width={160}
            neutral
            options={[
              { value: 'scheduled',  label: 'Scheduled'  },
              { value: 'checked_in', label: 'Checked In' },
              { value: 'completed',  label: 'Completed'  },
              { value: 'cancelled',  label: 'Cancelled'  },
            ]}
          />
          <CustomSelect
            value={sortBy}
            onChange={setSortBy}
            width={160}
            neutral
            options={[
              { value: 'date_desc', label: 'Newest First' },
              { value: 'date_asc',  label: 'Oldest First' },
              { value: 'status',    label: 'By Status'    },
            ]}
          />
        </div>

        {ref && (
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Results for "{ref}"
          </p>
        )}

        {loading
          ? <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>
          : <>
              <MyBookingsList bookings={paged} query={ref} onCancelled={() => {
                setLoading(true)
                const fetch = ref
                  ? getBookingByRef(ref).then(b => (b ? [b] : []))
                  : user ? getBookingsByUserId(user.id) : Promise.resolve([])
                fetch.then(setBookings).catch(() => setBookings([])).finally(() => setLoading(false))
              }} />

              {/* Pagination controls */}
              {sorted.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, flexWrap: 'wrap', gap: 10 }}>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
                    Showing {Math.min((page - 1) * PAGE_SIZE + 1, sorted.length)}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} booking{sorted.length !== 1 ? 's' : ''}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      style={{ padding: '7px 14px', fontSize: 15, fontWeight: 600, color: page === 1 ? '#A8A29E' : '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
                    >← Prev</button>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', minWidth: 64, textAlign: 'center' }}>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      style={{ padding: '7px 14px', fontSize: 15, fontWeight: 600, color: page === totalPages ? '#A8A29E' : '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
                    >Next →</button>
                  </div>
                </div>
              )}
            </>
        }
      </div>
    </div>
  )
}
