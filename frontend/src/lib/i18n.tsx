import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

/**
 * Lightweight kiosk i18n — no external library. Covers the welcome screen and
 * the most common driver-facing strings. Not every screen is translated yet;
 * anything missing falls back to the English key itself.
 */
export type Lang = 'en' | 'zh' | 'vi'

export const LANGUAGES: Array<{ code: Lang; label: string; native: string }> = [
  { code: 'en', label: 'English',   native: 'English' },
  { code: 'zh', label: 'Chinese',   native: '中文' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt' },
]

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    cfs:            'Container Freight Station',
    haveBooking:    'I have a booking — Pick Up or Drop Off',
    visiting:       "I'm visiting someone",
    needHelp:       'Need help? Speak to our reception team.',
    openToday:      'Open today: {hours}',
    closedToday:    'Closed today',
  },
  zh: {
    cfs:            '集装箱货运站',
    haveBooking:    '我有预约 — 取货或送货',
    visiting:       '我是来访客的',
    needHelp:       '需要帮助？请联系前台工作人员。',
    openToday:      '今日营业：{hours}',
    closedToday:    '今日休息',
  },
  vi: {
    cfs:            'Trạm Hàng Hóa Container',
    haveBooking:    'Tôi có đặt chỗ — Lấy hàng hoặc Giao hàng',
    visiting:       'Tôi đến thăm ai đó',
    needHelp:       'Cần giúp đỡ? Vui lòng liên hệ nhân viên lễ tân.',
    openToday:      'Hôm nay mở cửa: {hours}',
    closedToday:    'Hôm nay đóng cửa',
  },
}

const STORAGE_KEY = 'glido_kiosk_lang'

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
      return saved && DICT[saved] ? saved : 'en'
    } catch {
      return 'en'
    }
  })

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* noop */ }
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string>) => {
    let str = DICT[lang]?.[key] ?? DICT.en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v)
    return str
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
