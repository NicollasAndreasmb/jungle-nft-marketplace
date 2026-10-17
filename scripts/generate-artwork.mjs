/**
 * Generates deterministic SVG artwork for the mock catalog into public/nfts.
 *
 * The Figma assets are not accessible from this environment, so each fixture NFT gets
 * three seeded generative compositions (cover + two gallery variants). Output is stable
 * across runs, which keeps visual regression baselines reproducible.
 *
 * Usage: node scripts/generate-artwork.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NFT_COUNT = 36
const VARIANTS = 3
const SIZE = 600
const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'nfts')

const PALETTES = [
  ['#0f2a1d', '#1f6f50', '#b7f25c', '#f2f5f3', '#f5b841'],
  ['#14213d', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#1b1b1e', '#d64933', '#f2e8cf', '#4c956c', '#2c6e49'],
  ['#0b132b', '#3a506b', '#5bc0be', '#f0f3bd', '#ff6b6b'],
  ['#231942', '#5e548e', '#9f86c0', '#e0b1cb', '#f7d6e0'],
  ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#ffb703'],
  ['#102a43', '#f0b429', '#de911d', '#62b0e8', '#e6f6ff'],
  ['#1a1a2e', '#16c79a', '#f8f1f1', '#ffc75f', '#ff6f91'],
  ['#28262c', '#998fc7', '#d4c2fc', '#f9f5ff', '#14248a'],
]

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (random, list) => list[Math.floor(random() * list.length)]
const round = (value) => Math.round(value * 10) / 10

function orbits(random, palette) {
  const [background, ...colors] = palette
  const cx = SIZE * (0.35 + random() * 0.3)
  const cy = SIZE * (0.35 + random() * 0.3)
  const rings = Array.from({ length: 7 }, (_, index) => {
    const radius = 40 + index * (30 + random() * 18)
    const width = 6 + random() * 22
    const dash = round(20 + random() * 160)
    return `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="none" stroke="${pick(random, colors)}" stroke-width="${round(width)}" stroke-dasharray="${dash} ${round(dash / 2)}" stroke-linecap="round" transform="rotate(${Math.floor(random() * 360)} ${round(cx)} ${round(cy)})"/>`
  })
  const sun = `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(18 + random() * 30)}" fill="${colors[1]}"/>`
  return `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>${rings.join('')}${sun}`
}

function blocks(random, palette) {
  const [background, ...colors] = palette
  const cells = 6
  const cell = SIZE / cells
  const shapes = []
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const x = column * cell
      const y = row * cell
      const color = pick(random, colors)
      const kind = Math.floor(random() * 4)
      if (kind === 0) shapes.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${color}"/>`)
      if (kind === 1) shapes.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${round(cell * 0.38)}" fill="${color}"/>`)
      if (kind === 2) {
        const corner = Math.floor(random() * 4)
        const points = [
          `${x},${y} ${x + cell},${y} ${x},${y + cell}`,
          `${x},${y} ${x + cell},${y} ${x + cell},${y + cell}`,
          `${x + cell},${y} ${x + cell},${y + cell} ${x},${y + cell}`,
          `${x},${y} ${x + cell},${y + cell} ${x},${y + cell}`,
        ][corner]
        shapes.push(`<polygon points="${points}" fill="${color}"/>`)
      }
      if (kind === 3) {
        shapes.push(`<path d="M${x} ${y + cell} A${cell} ${cell} 0 0 1 ${x + cell} ${y}" fill="none" stroke="${color}" stroke-width="${round(cell * 0.18)}"/>`)
      }
    }
  }
  return `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>${shapes.join('')}`
}

function waves(random, palette) {
  const [background, ...colors] = palette
  const layers = Array.from({ length: 9 }, (_, index) => {
    const baseY = 80 + index * 62
    const amplitude = 20 + random() * 50
    const frequency = 1 + Math.floor(random() * 3)
    const points = []
    for (let step = 0; step <= 24; step += 1) {
      const x = (SIZE / 24) * step
      const y = baseY + Math.sin((step / 24) * Math.PI * 2 * frequency + random() * 0.4 + index) * amplitude
      points.push(`${round(x)},${round(y)}`)
    }
    return `<polyline points="${points.join(' ')} ${SIZE},${SIZE} 0,${SIZE}" fill="${colors[index % colors.length]}" opacity="${round(0.55 + random() * 0.45)}"/>`
  })
  return `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>${layers.join('')}`
}

const STYLES = [orbits, blocks, waves]

mkdirSync(outputDir, { recursive: true })

for (let index = 1; index <= NFT_COUNT; index += 1) {
  const id = `nft-${String(index).padStart(3, '0')}`
  const palette = PALETTES[index % PALETTES.length]
  for (let variant = 1; variant <= VARIANTS; variant += 1) {
    const random = createRandom(index * 7919 + variant * 104729)
    const style = STYLES[(index + variant - 1) % STYLES.length]
    const body = style(random, palette)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>\n`
    writeFileSync(join(outputDir, `${id}-${variant}.svg`), svg)
  }
}

console.log(`Generated ${NFT_COUNT * VARIANTS} artworks in ${outputDir}`)
