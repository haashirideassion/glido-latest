import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
  }
  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid or expired token' } })
  }
}

/**
 * Populates req.user when a valid Bearer token is present, but never rejects —
 * used on endpoints that serve both authenticated users and anonymous guests
 * (e.g. the public booking portal and saved-driver autofill) so the handler can
 * branch on identity/role without forcing a login.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as AuthUser
    } catch {
      /* invalid/expired token → treat as guest */
    }
  }
  next()
}

/** Roles that represent a self-service visitor (their saved data is private to them). */
export function isVisitorRole(role?: string): boolean {
  return role === 'visitor_registered' || role === 'visitor'
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } })
    }
    next()
  }
}
