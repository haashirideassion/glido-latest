import { useState, useEffect, createContext, useContext } from 'react'
import { ComplianceCapabilities } from '@/data/types'
import { getComplianceCapabilities, NO_COMPLIANCE_CAPABILITIES } from '@/lib/db/compliance'

/**
 * Capability gating for the Compliance module, read once per layout mount — mirrors
 * useBillingCapabilities. FRD 2.4.4 requires action buttons/tiles to be hidden rather than
 * fail on submit, so components read this before rendering.
 */

export interface ComplianceCapabilityState {
  caps: ComplianceCapabilities
  loading: boolean
  ready: boolean
}

export const ComplianceCapabilityContext = createContext<ComplianceCapabilityState>({
  caps: NO_COMPLIANCE_CAPABILITIES, loading: true, ready: false,
})

export function useLoadComplianceCapabilities(): ComplianceCapabilityState {
  const [state, setState] = useState<ComplianceCapabilityState>({ caps: NO_COMPLIANCE_CAPABILITIES, loading: true, ready: false })

  useEffect(() => {
    let cancelled = false
    getComplianceCapabilities()
      .then(caps => { if (!cancelled) setState({ caps, loading: false, ready: true }) })
      .catch(() => { if (!cancelled) setState({ caps: NO_COMPLIANCE_CAPABILITIES, loading: false, ready: true }) })
    return () => { cancelled = true }
  }, [])

  return state
}

export function useComplianceCapabilities(): ComplianceCapabilityState {
  return useContext(ComplianceCapabilityContext)
}
