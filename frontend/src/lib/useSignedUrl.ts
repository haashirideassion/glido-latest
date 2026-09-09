import { useState, useEffect } from 'react'
import { fetcher } from './fetcher'

/**
 * Fetches a pre-signed S3 URL for a given key/stored-value.
 * Returns empty string while loading or if key is empty.
 */
export function useSignedUrl(keyOrUrl: string | null | undefined): string {
  const [signedUrl, setSignedUrl] = useState('')

  useEffect(() => {
    if (!keyOrUrl) { setSignedUrl(''); return }
    // Already a blob/data URL — use as-is
    if (keyOrUrl.startsWith('data:') || keyOrUrl.startsWith('blob:')) {
      setSignedUrl(keyOrUrl)
      return
    }
    let cancelled = false
    fetcher(`/api/uploads/signed-url?key=${encodeURIComponent(keyOrUrl)}`)
      .then(res => { if (!cancelled) setSignedUrl(res?.data?.url ?? '') })
      .catch(() => { if (!cancelled) setSignedUrl('') })
    return () => { cancelled = true }
  }, [keyOrUrl])

  return signedUrl
}

/**
 * One-shot: fetch a signed URL and open it in a new tab.
 * Use for document "View" buttons.
 */
export async function openSignedUrl(keyOrUrl: string): Promise<void> {
  if (!keyOrUrl) return
  if (keyOrUrl.startsWith('data:') || keyOrUrl.startsWith('blob:')) {
    window.open(keyOrUrl, '_blank')
    return
  }
  const res = await fetcher(`/api/uploads/signed-url?key=${encodeURIComponent(keyOrUrl)}`)
  const url = res?.data?.url
  if (url) window.open(url, '_blank')
}
