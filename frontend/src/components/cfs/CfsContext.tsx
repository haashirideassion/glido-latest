import { createContext, useContext } from 'react'
import type { Direction, Mode, Stage, StageSummary } from '@/lib/cfs'

export interface CfsCtx {
  mode: Mode
  direction: Direction
  summary: StageSummary | null
  refreshSummary: () => void
  /** reception_admin / super_admin — may change settings and decline requests */
  isAdmin: boolean
  /** the stage a detail screen wants highlighted in the progress bar (null = follow the URL) */
  focusStage: Stage | null
  setFocusStage: (s: Stage | null) => void
}

export const CfsContext = createContext<CfsCtx | null>(null)

export function useCfs(): CfsCtx {
  const ctx = useContext(CfsContext)
  if (!ctx) throw new Error('useCfs must be used inside CfsLayout')
  return ctx
}
