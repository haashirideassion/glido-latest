// Email sending is handled by Supabase Edge Functions in the React app.
// This stub exists so any lingering imports don't break the build during migration.
export async function sendBookingConfirmation(_bookingId: string): Promise<void> {
  console.warn('sendBookingConfirmation: use Edge Function instead')
}

export async function sendEftReminder(_bookingId: string): Promise<void> {
  console.warn('sendEftReminder: use Edge Function instead')
}

export async function sendIcsHoldAlert(_bookingId: string): Promise<void> {
  console.warn('sendIcsHoldAlert: use Edge Function instead')
}

export async function sendBookingCompleted(_bookingId: string): Promise<void> {
  console.warn('sendBookingCompleted: use Edge Function instead')
}
