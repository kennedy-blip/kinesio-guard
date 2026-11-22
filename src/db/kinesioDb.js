/**
 * IndexedDB Clinical Longitudinal Vault & Offline-to-Online Sync Engine (Pure ES2024)
 * Stores tremor medication diaries, cervical posture sessions, and Romberg balance baselines.
 */

const DB_NAME = 'KinesioGuardClinicalVault'
const DB_VERSION = 1
const STORE_RECORDS = 'clinical_records'
const STORE_SYNC = 'sync_queue'

const INITIAL_SEED_RECORDS = [
  {
    id: 'kg-seed-001',
    category: 'TREMOR_PSD',
    title: 'Morning Baseline — Pre-Medication Rest Scan',
    recordedAtISO: '2026-11-20T08:15:00.000Z',
    primaryMetric: '4.82 Hz · 3.38 mm RMS',
    secondaryMetric: 'MDS-UPDRS: 2.8 (Rest Band)',
    notes: 'Right hand resting on armrest prior to morning dopaminergic dose; narrowband Q=9.4.',
    syncState: 'SYNCED',
    payload: {
      dominantFreqHz: 4.82,
      rmsDisplacementMm: 3.38,
      mdsUpdrsScore: 2.8,
      phenotype: 'PARKINSONIAN'
    }
  },
  {
    id: 'kg-seed-002',
    category: 'TREMOR_PSD',
    title: 'Post-Therapy Follow-Up (+60 min Intervention)',
    recordedAtISO: '2026-11-20T09:20:00.000Z',
    primaryMetric: '5.05 Hz · 0.62 mm RMS',
    secondaryMetric: 'MDS-UPDRS: 1.1 (-81% Amp)',
    notes: 'Marked 14.7 dB tremor amplitude attenuation 60 minutes post-intervention.',
    syncState: 'SYNCED',
    payload: {
      dominantFreqHz: 5.05,
      rmsDisplacementMm: 0.62,
      mdsUpdrsScore: 1.1,
      phenotype: 'PARKINSONIAN'
    }
  },
  {
    id: 'kg-seed-003',
    category: 'CERVICAL_LOAD',
    title: 'Workstation Ergonomic Audit — Standing Desk',
    recordedAtISO: '2026-11-21T14:40:00.000Z',
    primaryMetric: '12.5° Flexion · 24.4 lbs (108 N)',
    secondaryMetric: '0.07 Ton-Hrs/Day · C5–C7 Nominal',
    notes: 'Monitor raised 11 cm; zero slouch alerts across 90-minute coding sprint.',
    syncState: 'SYNCED',
    payload: {
      flexionDegrees: 12.5,
      effectiveLoadLbs: 24.4,
      compressiveForceNewtons: 108.5
    }
  },
  {
    id: 'kg-seed-004',
    category: 'ROMBERG_SWAY',
    title: 'Pre-Season Vestibular Concussion Baseline',
    recordedAtISO: '2026-11-22T07:30:00.000Z',
    primaryMetric: '41.8 mm² Closed · RQ 1.34',
    secondaryMetric: 'Velocity 11.2 mm/s · Low Fall Risk',
    notes: '15s Eyes-Open (31.2 mm²) vs 15s Eyes-Closed (41.8 mm²) sternum stabilometry.',
    syncState: 'PENDING_SYNC',
    payload: {
      eyesOpenAreaMm2: 31.2,
      eyesClosedAreaMm2: 41.8,
      rombergQuotient: 1.34
    }
  }
]

let memoryFallbackRecords = [...INITIAL_SEED_RECORDS]

function openVaultDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' })
        store.createIndex('recordedAtISO', 'recordedAtISO', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_SYNC)) {
        db.createObjectStore(STORE_SYNC, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadAllVaultRecords() {
  try {
    const db = await openVaultDb()
    if (!db) return [...memoryFallbackRecords]

    const existing = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RECORDS, 'readonly')
      const req = tx.objectStore(STORE_RECORDS).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })

    if (existing.length === 0) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_RECORDS, STORE_SYNC], 'readwrite')
        const recStore = tx.objectStore(STORE_RECORDS)
        const syncStore = tx.objectStore(STORE_SYNC)
        for (const item of INITIAL_SEED_RECORDS) {
          recStore.put(item)
          if (item.syncState === 'PENDING_SYNC') {
            syncStore.put({ id: item.id, queuedAtISO: item.recordedAtISO, record: item })
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return [...INITIAL_SEED_RECORDS].sort((a, b) => b.recordedAtISO.localeCompare(a.recordedAtISO))
    }

    return existing.sort((a, b) => b.recordedAtISO.localeCompare(a.recordedAtISO))
  } catch {
    return [...memoryFallbackRecords]
  }
}

export async function saveVaultRecord(entry, simulateOffline = false) {
  const nowISO = new Date().toISOString()
  const record = {
    id: entry.id || `kg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: entry.category || 'TREMOR_PSD',
    title: entry.title || 'Clinical Biomechanics Capture',
    recordedAtISO: entry.recordedAtISO || nowISO,
    primaryMetric: entry.primaryMetric || '',
    secondaryMetric: entry.secondaryMetric || '',
    notes: entry.notes || '',
    syncState: simulateOffline ? 'PENDING_SYNC' : 'SYNCED',
    payload: entry.payload || {}
  }

  try {
    const db = await openVaultDb()
    if (!db) {
      memoryFallbackRecords = [record, ...memoryFallbackRecords]
      return record
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RECORDS, STORE_SYNC], 'readwrite')
      tx.objectStore(STORE_RECORDS).put(record)
      if (record.syncState === 'PENDING_SYNC') {
        tx.objectStore(STORE_SYNC).put({ id: record.id, queuedAtISO: nowISO, record })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    memoryFallbackRecords = [record, ...memoryFallbackRecords]
  }
  return record
}

export async function deleteVaultRecord(id) {
  try {
    const db = await openVaultDb()
    if (!db) {
      memoryFallbackRecords = memoryFallbackRecords.filter((r) => r.id !== id)
      return true
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RECORDS, STORE_SYNC], 'readwrite')
      tx.objectStore(STORE_RECORDS).delete(id)
      tx.objectStore(STORE_SYNC).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

export async function flushPendingVaultSync(syncCallback) {
  const all = await loadAllVaultRecords()
  const pending = all.filter((r) => r.syncState === 'PENDING_SYNC')
  if (!pending.length) return { flushedCount: 0, records: all }

  for (const rec of pending) {
    if (typeof syncCallback === 'function') {
      await syncCallback(rec.payload)
    }
    rec.syncState = 'SYNCED'
  }

  try {
    const db = await openVaultDb()
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_RECORDS, STORE_SYNC], 'readwrite')
        const recStore = tx.objectStore(STORE_RECORDS)
        const syncStore = tx.objectStore(STORE_SYNC)
        for (const rec of pending) {
          recStore.put(rec)
          syncStore.delete(rec.id)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
  } catch {
    // Keep memory updated
  }

  const refreshed = await loadAllVaultRecords()
  return { flushedCount: pending.length, records: refreshed }
}

export function build200HzAccelerometerCsv(ax, ay, az, sampleRateHz = 200) {
  const lines = ['sample_index,time_sec,linear_ax_mps2,linear_ay_mps2,linear_az_mps2,resultant_mps2']
  const n = Math.min(ax.length, ay.length, az.length)
  for (let i = 0; i < n; i++) {
    const t = (i / sampleRateHz).toFixed(4)
    const x = Number(ax[i]).toFixed(5)
    const y = Number(ay[i]).toFixed(5)
    const z = Number(az[i]).toFixed(5)
    const mag = Math.hypot(ax[i], ay[i], az[i]).toFixed(5)
    lines.push(`${i},${t},${x},${y},${z},${mag}`)
  }
  return lines.join('\n')
}

export function triggerBrowserFileDownload(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
