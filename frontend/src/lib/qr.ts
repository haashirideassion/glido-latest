import * as QRCode from 'qrcode'

export async function generateQRDataURL(text: string, size = 200): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: '#090D12', light: '#F1F5F9' },
    errorCorrectionLevel: 'M',
  })
}

export async function generateQRSVG(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
}
