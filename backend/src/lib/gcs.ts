import { Storage } from '@google-cloud/storage'

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'glido-media-prod'

// Picks up credentials automatically:
// - In production: Application Default Credentials via the attached service
//   account on the Cloud Run / GCE / GKE resource — no key file.
// - In local dev: `gcloud auth application-default login`, or set
//   GOOGLE_APPLICATION_CREDENTIALS to a key file path.
const storage = new Storage()
const bucket = storage.bucket(BUCKET_NAME)

export async function uploadBuffer(key: string, buffer: Buffer, contentType?: string): Promise<void> {
  await bucket.file(key).save(buffer, {
    contentType,
    resumable: false,
  })
}

export async function getSignedReadUrl(key: string, expiresInMs = 15 * 60 * 1000): Promise<string> {
  const [url] = await bucket.file(key).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMs,
  })
  return url
}

export function getReadStream(key: string) {
  return bucket.file(key).createReadStream()
}

export async function getMetadata(key: string) {
  const [metadata] = await bucket.file(key).getMetadata()
  return metadata
}

export { BUCKET_NAME }
