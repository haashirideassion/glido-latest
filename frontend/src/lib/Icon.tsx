import type { CSSProperties } from 'react'

// Teach TypeScript about the iconify-icon web component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        icon?: string; width?: string | number; height?: string | number; inline?: boolean
      }
    }
  }
}

interface IconProps {
  name: string
  size?: number
  className?: string
  style?: CSSProperties
}

// Use the iconify-icon web component — React owns the outer element, Iconify
// renders the SVG inside shadow DOM, so React unmounting never conflicts.
export const Icon = ({ name, size = 20, className = '', style }: IconProps) => (
  <iconify-icon
    icon={name}
    width={size}
    height={size}
    className={className || undefined}
    style={style as any}
  />
)

export const ICONS = {
  home:           'solar:home-2-bold-duotone',
  bookings:       'solar:document-text-bold-duotone',
  walkIn:         'solar:user-plus-rounded-bold-duotone',
  reports:        'solar:chart-2-bold-duotone',
  settings:       'solar:settings-bold-duotone',
  arrowRight:     'solar:alt-arrow-right-bold-duotone',
  arrowLeft:      'solar:alt-arrow-left-bold-duotone',
  arrowUp:        'solar:alt-arrow-up-bold-duotone',
  arrowDown:      'solar:alt-arrow-down-bold-duotone',
  close:          'solar:close-circle-bold-duotone',
  check:          'solar:check-circle-bold-duotone',
  checkSquare:    'solar:verified-check-bold-duotone',
  search:         'solar:magnifer-bold-duotone',
  add:            'solar:add-circle-bold-duotone',
  upload:         'solar:upload-minimalistic-bold-duotone',
  download:       'solar:download-minimalistic-bold-duotone',
  trash:          'solar:trash-bin-minimalistic-bold-duotone',
  edit:           'solar:pen-bold-duotone',
  eye:            'solar:eye-bold-duotone',
  eyeOff:         'solar:eye-closed-bold-duotone',
  copy:           'solar:copy-bold-duotone',
  filter:         'solar:filter-bold-duotone',
  sort:           'solar:sort-bold-duotone',
  refresh:        'solar:refresh-bold-duotone',
  pending:        'solar:hourglass-bold-duotone',
  confirmed:      'solar:ticket-star-bold-duotone',
  inProgress:     'solar:play-circle-bold-duotone',
  completed:      'solar:check-circle-bold-duotone',
  cancelled:      'solar:forbidden-circle-bold-duotone',
  noShow:         'solar:close-circle-bold-duotone',
  warning:        'solar:danger-bold-duotone',
  info:           'solar:info-circle-bold-duotone',
  import:         'solar:download-bold-duotone',
  export:         'solar:upload-bold-duotone',
  transshipment:  'solar:transfer-horizontal-bold-duotone',
  container:      'solar:box-bold-duotone',
  cargo:          'solar:delivery-bold-duotone',
  truck:          'solar:delivery-bold-duotone',
  ship:           'solar:global-bold-duotone',
  document:       'solar:file-text-bold-duotone',
  logo:           'solar:widget-5-bold-duotone',
  kiosk:          'solar:monitor-smartphone-bold-duotone',
  qrCode:         'solar:qr-code-bold-duotone',
  camera:         'solar:camera-bold-duotone',
  calendar:       'solar:calendar-date-bold-duotone',
  clock:          'solar:clock-circle-bold-duotone',
  bell:           'solar:bell-bing-bold-duotone',
  star:           'solar:star-bold-duotone',
  layers:         'solar:layers-minimalistic-bold-duotone',
  user:           'solar:user-rounded-bold-duotone',
  users:          'solar:users-group-rounded-bold-duotone',
  userCheck:      'solar:user-check-rounded-bold-duotone',
  phone:          'solar:phone-bold-duotone',
  email:          'solar:letter-bold-duotone',
  car:            'solar:user-check-rounded-bold-duotone',
  logout:         'solar:logout-2-bold-duotone',
  shield:         'solar:shield-keyhole-bold-duotone',
  palette:        'solar:pallete-2-bold-duotone',
  lock:           'solar:lock-keyhole-bold-duotone',
  layers2:        'solar:layers-bold-duotone',
  chartBar:       'solar:graph-new-bold-duotone',
  percent:        'solar:pie-chart-2-bold-duotone',
  walletMoney:    'solar:wallet-money-bold-duotone',
} as const
