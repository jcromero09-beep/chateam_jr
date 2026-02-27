/**
 * Utilidad para generar paleta MUI (50-900) desde un color hex base.
 * Sin dependencias externas - usa HSL nativo.
 */

function hexToHsl(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 50]

  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100

  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }

  return `#${f(0)}${f(8)}${f(4)}`
}

export function generatePalette(baseHex: string): Record<string, string> {
  const [h, s, l] = hexToHsl(baseHex)

  return {
    50:  hslToHex(h, Math.max(s - 10, 10), Math.min(95, l + 40)),
    100: hslToHex(h, Math.max(s - 5, 10),  Math.min(90, l + 32)),
    200: hslToHex(h, s,                     Math.min(82, l + 22)),
    300: hslToHex(h, s,                     Math.min(72, l + 12)),
    400: hslToHex(h, s,                     Math.min(62, l + 4)),
    500: baseHex,
    600: hslToHex(h, s,                     Math.max(10, l - 8)),
    700: hslToHex(h, s,                     Math.max(10, l - 16)),
    800: hslToHex(h, s,                     Math.max(10, l - 24)),
    900: hslToHex(h, s,                     Math.max(5,  l - 32)),
  }
}
