/**
 * Supabase has been removed from this project.
 * All data access goes through the Express backend at /api/*.
 * This file is kept as a tombstone to prevent stale imports from causing
 * "module not found" errors during the transition. Safe to delete once
 * all imports referencing '@/lib/supabase' have been cleaned up.
 */

export const supabase = null
export const supabaseAdmin = null
export const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
