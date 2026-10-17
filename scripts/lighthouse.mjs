/**
 * Lighthouse audit runner.
 *
 * Builds nothing by itself: run `npm run build` first. Starts `vite preview` (optimized build with
 * the default mock scenario), audits each page/profile from lighthouse/audit.config.json N times in
 * a fresh Chromium (Playwright's build), stores every HTML/JSON report in lighthouse/reports and
 * writes summary.json + summary.md with medians, LCP/CLS/TBT, tool versions and environment.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'lighthouse/audit.config.json'), 'utf8'))
const reportsDir = join(root, 'lighthouse/reports')
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function waitForServer(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Server did not start at ${url}`)
}

function packageVersion(name) {
  return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version
}

mkdirSync(reportsDir, { recursive: true })
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore' })

try {
  await waitForServer(config.baseUrl)
  const results = []
  for (const page of config.pages) {
    for (const profile of config.profiles) {
      const runs = []
      for (let run = 1; run <= config.runsPerPage; run += 1) {
        const chrome = await launch({
          chromePath: chromium.executablePath(),
          chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
        })
        try {
          const flags = { port: chrome.port, output: ['html', 'json'], logLevel: 'error' }
          const result = await lighthouse(`${config.baseUrl}${page.path}`, flags, profile === 'desktop' ? desktopConfig : undefined)
          const [html, json] = result.report
          const base = join(reportsDir, `${page.id}-${profile}-run${run}`)
          writeFileSync(`${base}.html`, html)
          writeFileSync(`${base}.json`, json)
          const { categories, audits } = result.lhr
          const scores = Object.fromEntries(CATEGORIES.map((id) => [id, Math.round((categories[id]?.score ?? 0) * 100)]))
          runs.push({
            run,
            scores,
            lcpMs: Math.round(audits['largest-contentful-paint'].numericValue),
            cls: Number(audits['cumulative-layout-shift'].numericValue.toFixed(3)),
            tbtMs: Math.round(audits['total-blocking-time'].numericValue),
          })
          console.log(`${page.id} ${profile} run ${run}:`, JSON.stringify(runs.at(-1)))
        } finally {
          await chrome.kill()
        }
      }
      results.push({
        page: page.id,
        path: page.path,
        profile,
        runs,
        median: {
          ...Object.fromEntries(CATEGORIES.map((id) => [id, median(runs.map((run) => run.scores[id]))])),
          lcpMs: median(runs.map((run) => run.lcpMs)),
          cls: median(runs.map((run) => run.cls)),
          tbtMs: median(runs.map((run) => run.tbtMs)),
        },
      })
    }
  }

  const environment = {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    lighthouse: packageVersion('lighthouse'),
    chromeLauncher: packageVersion('chrome-launcher'),
    playwrightChromium: chromium.executablePath().match(/chromium[-_][^/\\]+/)?.[0] ?? 'chromium',
    conditions: 'vite preview (build otimizado) em localhost, cenário padrão dos mocks, throttling padrão do Lighthouse (mobile: Moto G Power/4G lento simulado; desktop: preset desktop)',
  }
  writeFileSync(join(reportsDir, 'summary.json'), JSON.stringify({ environment, targets: config.targets, results }, null, 2))

  const lines = [
    '# Lighthouse — mediana de 3 execuções',
    '',
    `Gerado em ${environment.date} · Lighthouse ${environment.lighthouse} · Node ${environment.node} · ${environment.platform}`,
    '',
    '| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP (ms) | CLS | TBT (ms) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...results.map(
      (result) =>
        `| ${result.page} | ${result.profile} | ${result.median.performance} | ${result.median.accessibility} | ${result.median['best-practices']} | ${result.median.seo} | ${result.median.lcpMs} | ${result.median.cls} | ${result.median.tbtMs} |`,
    ),
    '',
  ]
  writeFileSync(join(reportsDir, 'summary.md'), lines.join('\n'))
  console.log(lines.join('\n'))
} finally {
  server.kill()
}
