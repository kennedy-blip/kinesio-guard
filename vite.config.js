import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { evaluateCervicalLoadOffline } from './src/engines/cervicalGoMirror.js'

function kinesioGoTriageDevPlugin() {
  const handleApiRequest = (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/kinesio_triage')) {
      return next()
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    let rawBody = ''
    req.on('data', (chunk) => {
      rawBody += chunk
    })
    req.on('end', () => {
      let body = {}
      try {
        if (rawBody) body = JSON.parse(rawBody)
      } catch {
        body = {}
      }

      const flexion = Number(body.flexionDegrees ?? 30)
      const massKg = Number(body.headMassKg ?? 5.0)
      const hours = Number(body.dailyScreenHours ?? 5.5)
      const freqHz = Number(body.tremorFreqHz ?? 7.4)
      const rmsMm = Number(body.tremorRmsMm ?? 0.08)
      const openMm2 = Math.max(4, Number(body.eyesOpenAreaMm2 ?? 42))
      const closedMm2 = Math.max(2, Number(body.eyesClosedAreaMm2 ?? 57))

      const cervical = evaluateCervicalLoadOffline(flexion, massKg, hours)
      const logUpdrsScore =
        rmsMm < 0.12
          ? 0
          : Math.round(Math.max(0, Math.min(4, Math.log10((rmsMm / 10) / 0.025) * 1.65)) * 100) / 100
      const rq = Math.round((closedMm2 / openMm2) * 100) / 100

      const cervicalNorm = Math.min(1, Math.max(0, (cervical.flexionDegrees - 8) / 52))
      const tremorNorm = Math.min(1, logUpdrsScore / 3.2)
      const rombergNorm = Math.min(1, Math.max(0, (rq - 1.4) / 3.2))
      const shaderStress = Math.max(cervicalNorm, tremorNorm, rombergNorm)

      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.statusCode = 200
      res.end(
        JSON.stringify({
          engine: 'KINESIO-GUARD Go 1.22 Biomechanics & Neurological Triage Engine',
          goRuntimeVersion: 'go1.22',
          computedAtISO: new Date().toISOString(),
          compositeRiskIdx: Math.round((0.4 * cervicalNorm + 0.35 * tremorNorm + 0.25 * rombergNorm) * 1000) / 10,
          shaderStressLevel: Math.round(shaderStress * 1000) / 1000,
          cervical,
          tremor: {
            dominantFreqHz: freqHz,
            rmsDisplacementMm: rmsMm,
            logUpdrsScore,
            discreteUpdrsGrade: Math.round(logUpdrsScore)
          },
          romberg: {
            eyesOpenAreaMm2: openMm2,
            eyesClosedAreaMm2: closedMm2,
            rombergQuotient: rq,
            vestibularAlert: closedMm2 > 260 || rq > 3.2
          }
        })
      )
    })
  }

  return {
    name: 'kinesio-go-triage-dev-middleware',
    configureServer(server) {
      server.middlewares.use(handleApiRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApiRequest)
    }
  }
}

export default defineConfig({
  plugins: [vue(), kinesioGoTriageDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  }
})
