// Returns '' if valid, or an error message string if invalid.
export const validators = {
  required: (v: string) => v.trim() ? '' : 'This field is required',

  name: (v: string) => {
    if (!v.trim()) return ''
    return /^[A-Za-z\s'\-.]+$/.test(v.trim()) ? '' : 'Only letters, spaces, hyphens and apostrophes allowed'
  },

  email: (v: string) => {
    if (!v.trim()) return ''
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Enter a valid email address'
  },

  phoneAU: (v: string) => {
    if (!v.trim()) return ''
    const d = v.replace(/\D/g, '')
    if (d.length !== 10) return 'Enter a valid 10-digit phone number'
    if (!/^(02|03|04|07|08)/.test(d)) return 'Must start with 02, 03, 04, 07 or 08'
    return ''
  },

  numeric: (v: string, min?: number, max?: number) => {
    if (!v.trim()) return ''
    if (!/^\d+$/.test(v.trim())) return 'Numbers only'
    const n = Number(v)
    if (min != null && n < min) return `Minimum ${min}`
    if (max != null && n > max) return `Maximum ${max}`
    return ''
  },
}

// Input sanitizers — strip disallowed chars AS the user types (use in onChange)
export const sanitize = {
  digitsOnly: (v: string) => v.replace(/\D/g, ''),
  nameChars:  (v: string) => v.replace(/[^A-Za-z\s'\-.]/g, ''),
}
