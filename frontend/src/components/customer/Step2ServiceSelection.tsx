import { useState, useMemo, useEffect } from 'react'
import { useServiceRequestWizard } from '@/contexts/ServiceRequestWizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import { OptionTile } from './OptionTile'
import { getStoreTypes } from '@/lib/db/store-types'
import { DEFAULT_TENANT_ID } from '@/lib/useTenantInfo'
import type { ServiceKey, StoreSubType, StoreDetailEntry } from '@/data/types'
import collectionImg from '@/assets/Collection.png'
import storeImg from '@/assets/Store.png'
import unpackImg from '@/assets/unpack.png'
import inspectionImg from '@/assets/Inspection.png'
import packageImg from '@/assets/package.png'

interface ServiceDef { key: ServiceKey; label: string; icon: string; image?: string }

// FR 1.1.4.2 "Selected Services" list, matched 1:1. Note the FRD names these tiles differently in
// FR 1.1.2.2 ("FCL Delivery", "Unpack", "Dehire") than in FR 1.1.4.2 ("FCL collection", "Pack",
// "Empty container collection"); the 1.1.4.2 naming is what ships.
const BASE_SERVICES: ServiceDef[] = [
  { key: 'fcl_collection_terminal', label: 'FCL run into Terminal',        icon: ICONS.truck,     image: collectionImg },
  { key: 'fcl_storage',             label: 'FCL Storage',                  icon: ICONS.container, image: storeImg },
  { key: 'fcl_collection',          label: 'FCL collection',               icon: ICONS.truck,     image: collectionImg },
  { key: 'dehire',                  label: 'Empty container collection',   icon: ICONS.truck },
  { key: 'lcl_collection',          label: 'LCL collection',               icon: ICONS.truck,     image: collectionImg },
  { key: 'lcl_storage',             label: 'LCL storage',                  icon: ICONS.container, image: storeImg },
  { key: 'unpack',                  label: 'Pack',                         icon: ICONS.layers,    image: unpackImg },
  { key: 'inspection_compliance',   label: 'Inspection & compliance',      icon: ICONS.shield,    image: inspectionImg },
]

const STORAGE_KEYS: ServiceKey[] = ['fcl_storage', 'lcl_storage']

// FR 1.1.2.2 — "When the user clicks on the service selection 'FCL Delivery' and/or 'Unpack' then
// the user will be displayed with another service selection tile card – 'Dehire'." In this naming
// FCL Delivery is fcl_collection, Unpack is unpack, and Dehire is dehire. The tile stays hidden
// until one of its triggers is picked, and deselects itself if every trigger is removed.
const DEHIRE_KEY: ServiceKey = 'dehire'
const DEHIRE_TRIGGERS: ServiceKey[] = ['fcl_collection', 'unpack']

// Fallback shown only if the CFS admin hasn't configured any Store Types yet (Settings → Store Types).
const FALLBACK_STORE_SUBTYPES: Array<{ value: StoreSubType; label: string }> = [
  { value: 'underbond', label: 'Underbond' },
  { value: 'reefer',    label: 'Reefer' },
  { value: 'general',   label: 'General' },
]

const OTHER_TYPE = 'Other'

export function Step2ServiceSelection() {
  const { state, dispatch } = useServiceRequestWizard()
  const [search, setSearch] = useState('')
  const [storagePopupKey, setStoragePopupKey] = useState<ServiceKey | null>(null)
  // Keyed by type label (e.g. "Underbond", "Reefer", "Other"); presence in the map means checked.
  const [pendingDetails, setPendingDetails] = useState<Record<string, StoreDetailEntry>>({})
  const [storeSubtypes, setStoreSubtypes] = useState<Array<{ value: StoreSubType; label: string }>>(FALLBACK_STORE_SUBTYPES)

  useEffect(() => {
    getStoreTypes(DEFAULT_TENANT_ID, true).then(rows => {
      if (rows.length > 0) setStoreSubtypes(rows.map(r => ({ value: r.name, label: r.name })))
    }).catch(() => {})
  }, [])

  const selectedKeys = state.selectedServices.map(s => s.serviceKey)
  const dehireUnlocked = DEHIRE_TRIGGERS.some(k => selectedKeys.includes(k))

  // Deselecting every trigger has to take Dehire with it — otherwise a request keeps a service the
  // customer can no longer see, let alone remove.
  useEffect(() => {
    if (!dehireUnlocked && selectedKeys.includes(DEHIRE_KEY)) {
      dispatch({ type: 'REMOVE_SERVICE', serviceKey: DEHIRE_KEY })
    }
  }, [dehireUnlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  const services = useMemo(() => {
    const visible = dehireUnlocked ? BASE_SERVICES : BASE_SERVICES.filter(s => s.key !== DEHIRE_KEY)
    if (!search.trim()) return visible
    return visible.filter(s => s.label.toLowerCase().includes(search.trim().toLowerCase()))
  }, [search, dehireUnlocked])

  const selectedMap = new Map(state.selectedServices.map(s => [s.serviceKey, s]))

  const handleClick = (svc: ServiceDef) => {
    if (STORAGE_KEYS.includes(svc.key)) {
      if (selectedMap.has(svc.key)) {
        dispatch({ type: 'REMOVE_SERVICE', serviceKey: svc.key })
      } else {
        setPendingDetails({})
        setStoragePopupKey(svc.key)
      }
      return
    }
    dispatch({ type: 'TOGGLE_SERVICE', serviceKey: svc.key })
  }

  const toggleType = (label: string) => {
    setPendingDetails(prev => {
      const next = { ...prev }
      if (next[label]) {
        delete next[label]
      } else {
        next[label] = label.toLowerCase() === 'reefer' ? { type: label, power: false } : { type: label }
      }
      return next
    })
  }

  const updateType = (label: string, patch: Partial<StoreDetailEntry>) => {
    setPendingDetails(prev => ({ ...prev, [label]: { ...prev[label], ...patch, type: label } }))
  }

  const confirmStorage = () => {
    if (!storagePopupKey) return
    const entries = Object.values(pendingDetails)
    const subType = entries.map(e => e.type).join(', ')
    dispatch({ type: 'TOGGLE_SERVICE', serviceKey: storagePopupKey, subType, storeDetails: entries })
    setStoragePopupKey(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={packageImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Service selection</h2>
          <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Select one or more services you need</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Icon name={ICONS.search} size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', zIndex: 1 }} />
        <input
          type="text" placeholder="Search services" value={search} onChange={e => setSearch(e.target.value)}
          className="wizard-field" style={{ paddingLeft: 40 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {services.map(svc => {
          const sel = selectedMap.get(svc.key)
          const isSelected = !!sel
          return (
            <OptionTile
              key={svc.key}
              selected={isSelected}
              onClick={() => handleClick(svc)}
              icon={<Icon name={svc.icon} size={28} />}
              image={svc.image}
              title={svc.label}
              desc={STORAGE_KEYS.includes(svc.key) && sel?.subType ? sel.subType : ''}
            />
          )
        })}
      </div>

      {/* Storage sub-type popup — shared by FCL Storage and LCL Storage. Multi-select: any
          combination of the admin-configured store types plus a free-text "Other" catch-all.
          Reefer additionally captures Power (Y/N) and, when Y, Temp. */}
      {storagePopupKey && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={() => setStoragePopupKey(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '24px 24px 20px', maxWidth: 420, width: '100%', maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>Select store type(s)</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Select one or more options that apply</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {[...storeSubtypes, { value: OTHER_TYPE, label: OTHER_TYPE }].map(st => {
                const checked = !!pendingDetails[st.label]
                const entry = pendingDetails[st.label]
                const isReefer = st.label.toLowerCase() === 'reefer'
                const isOther = st.label === OTHER_TYPE
                return (
                  <div key={st.label} style={{ border: `1.5px solid ${checked ? 'var(--brand-color)' : 'rgba(0,0,0,0.10)'}`, borderRadius: 'var(--r-sm)', background: checked ? 'rgba(var(--brand-rgb),0.05)' : 'transparent' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleType(st.label)} />
                      <span style={{ fontSize: 14.5, fontWeight: 500, color: '#1C1917' }}>{st.label}</span>
                    </label>
                    {checked && (
                      <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {isReefer && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Power</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {(['Yes', 'No'] as const).map(opt => {
                                  const isYes = opt === 'Yes'
                                  const active = !!entry?.power === isYes
                                  return (
                                    <button key={opt} type="button" onClick={() => updateType(st.label, { power: isYes, temp: isYes ? entry?.temp : undefined })}
                                      style={{ padding: '4px 12px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: `1.5px solid ${active ? 'var(--brand-color)' : 'rgba(0,0,0,0.15)'}`, background: active ? 'var(--brand-color)' : '#fff', color: active ? '#fff' : '#1C1917', cursor: 'pointer' }}>
                                      {opt}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            {entry?.power && (
                              <input type="text" placeholder="Temperature (e.g. -18°C)" value={entry?.temp ?? ''} onChange={e => updateType(st.label, { temp: e.target.value })}
                                className="wizard-field" style={{ fontSize: 13.5 }} />
                            )}
                          </>
                        )}
                        {isOther ? (
                          <input type="text" placeholder="Please specify" value={entry?.note ?? ''} onChange={e => updateType(st.label, { note: e.target.value })}
                            className="wizard-field" style={{ fontSize: 13.5 }} />
                        ) : (
                          /* resize:none — the vertical-resize affordance renders as a spinner-like
                             arrow pair in the corner and reads as a number stepper. Height is set
                             explicitly because .wizard-field pins 40px, which makes rows={2} a no-op. */
                          <textarea placeholder="Note (optional)" value={entry?.note ?? ''} onChange={e => updateType(st.label, { note: e.target.value })}
                            className="wizard-field" rows={2} style={{ fontSize: 13.5, resize: 'none', height: 64, paddingTop: 9, paddingBottom: 9, lineHeight: 1.45 }} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setStoragePopupKey(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={Object.keys(pendingDetails).length === 0} onClick={confirmStorage}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
