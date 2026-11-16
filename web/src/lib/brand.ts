// Brand theming: derive a usable palette from one brand hex, with an
// accessibility clamp, and apply it to the app root as CSS variables.
// Semantic colours (open/closed/error) are never touched here.

interface RGB {
  r: number
  g: number
  b: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

const toLinear = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = ({ r, g, b }: RGB) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
/** Contrast of white text on the given background. */
const contrastWhite = (rgb: RGB) => 1.05 / (luminance(rgb) + 0.05)

function rgbToHsl({ r, g, b }: RGB) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h, s, l }
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): RGB {
  if (!s) return { r: l * 255, g: l * 255, b: l * 255 }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 }
}

const adjustL = (rgb: RGB, delta: number): RGB => {
  const hsl = rgbToHsl(rgb)
  hsl.l = clamp(hsl.l + delta, 0, 1)
  return hslToRgb(hsl)
}
const mixWhite = (rgb: RGB, amt: number): RGB => ({
  r: rgb.r + (255 - rgb.r) * amt,
  g: rgb.g + (255 - rgb.g) * amt,
  b: rgb.b + (255 - rgb.b) * amt,
})

export interface BrandPalette {
  primary: string
  top: string
  hover: string
  brand: string
  active: string
}

/** Derive the palette, darkening the hue until white text clears 4.5:1 on the
 *  lightest gradient stop — so a chosen brand colour can never make a primary
 *  button unreadable. */
export function deriveBrand(hex: string): BrandPalette | null {
  let rgb = hexToRgb(hex)
  if (!rgb) return null
  let guard = 0
  while (contrastWhite(adjustL(rgb, 0.05)) < 4.5 && guard++ < 60) {
    rgb = adjustL(rgb, -0.02)
  }
  return {
    primary: rgbToHex(rgb),
    top: rgbToHex(adjustL(rgb, 0.05)),
    hover: rgbToHex(adjustL(rgb, -0.08)),
    brand: rgbToHex(adjustL(rgb, 0.1)),
    active: rgbToHex(mixWhite(rgb, 0.84)),
  }
}

const KEYS = ['--color-primary', '--color-primary-top', '--color-primary-hover', '--color-brand', '--color-active']

function appRoot(el?: HTMLElement): HTMLElement {
  return el ?? document.getElementById('fc-app-root') ?? document.documentElement
}

export function applyBrand(hex: string, el?: HTMLElement) {
  const d = deriveBrand(hex)
  if (!d) return
  const root = appRoot(el)
  root.style.setProperty('--color-primary', d.primary)
  root.style.setProperty('--color-primary-top', d.top)
  root.style.setProperty('--color-primary-hover', d.hover)
  root.style.setProperty('--color-brand', d.brand)
  root.style.setProperty('--color-active', d.active)
}

export function clearBrand(el?: HTMLElement) {
  const root = appRoot(el)
  for (const k of KEYS) root.style.removeProperty(k)
}

const storeKey = (ws: string) => `fc.brand.${ws}`

export function saveBrand(ws: string, hex: string | null) {
  try {
    if (hex) localStorage.setItem(storeKey(ws), hex)
    else localStorage.removeItem(storeKey(ws))
  } catch {
    /* storage may be unavailable in some embeds */
  }
}

export function loadBrand(ws: string): string | null {
  try {
    return localStorage.getItem(storeKey(ws))
  } catch {
    return null
  }
}

/** Apply the saved brand for a workspace, or reset to the default palette. */
export function syncBrand(ws: string, el?: HTMLElement) {
  const saved = loadBrand(ws)
  if (saved) applyBrand(saved, el)
  else clearBrand(el)
}

export const DEFAULT_BRAND = '#43386b'
export const BRAND_PRESETS: { name: string; hex: string }[] = [
  { name: 'Grape (default)', hex: '#43386b' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Emerald', hex: '#047857' },
  { name: 'Ocean', hex: '#1d4ed8' },
  { name: 'Rose', hex: '#be123c' },
  { name: 'Amber', hex: '#b45309' },
  { name: 'Slate', hex: '#334155' },
]
