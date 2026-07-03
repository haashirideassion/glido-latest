import { postFetcher } from '@/lib/fetcher'

export interface SignUpVisitorOpts {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  company?: string
}

/**
 * Create a visitor account via the Express backend.
 * /api/auth/register endpoint — add to backend when visitor sign-up is needed.
 */
export async function signUpVisitor(opts: SignUpVisitorOpts): Promise<void> {
  const res = await postFetcher('/api/auth/register', {
    email:      opts.email,
    password:   opts.password,
    first_name: opts.firstName,
    last_name:  opts.lastName,
    phone:      opts.phone   ?? null,
    company:    opts.company ?? null,
    role:       'visitor_registered',
  })
  if (!res?.success) {
    throw new Error(res?.error?.message ?? 'Registration failed')
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────
export { isReceptionRole, isVisitorRole, useAuth } from '@/contexts/AuthContext'
