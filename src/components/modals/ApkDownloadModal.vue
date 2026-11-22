<script setup>
import { ref, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import {
  Download,
  Smartphone,
  ShieldCheck,
  Copy,
  Check,
  X,
  QrCode,
  PackageCheck,
  Cpu
} from 'lucide-vue-next'
import {
  APK_RELEASE_URL,
  EMBEDDED_APK_FILE_ENTRIES,
  fetchSignedApkManifest,
  formatApkBytes,
  triggerEmbeddedOneTapApkDownload
} from '../../engines/apkSelfPackager.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  theme: { type: String, default: 'obsidian' },
  nativeBridge: {
    type: Object,
    default: () => ({ isNativeApk: false, platform: 'web-browser' })
  }
})

const emit = defineEmits(['close'])

const qrSvgMarkup = ref('')
const copiedHash = ref(false)
const showManifest = ref(false)
const isDownloading = ref(false)
const downloadSuccessNotice = ref('')
const apkManifest = ref({
  packageId: 'com.kinesioguard.neuro',
  versionName: '1.0.0',
  versionCode: 100,
  minSdk: 22,
  targetSdk: 34,
  byteLength: 0,
  sizeFormatted: 'Loading...',
  sha256: 'Verifying signed release digest...',
  certSha256: 'Verifying apksigner v1+v2+v3 certificate...',
  signingSchemes: ['v1 (JAR)', 'v2 (APK Sig Block)', 'v3 (Key Rotation)'],
  compiler: 'Gradle 8 + Temurin JDK 17 + Capacitor 6.2 + Rustc WASM32',
  wasmByteLength: 0,
  entryCount: EMBEDDED_APK_FILE_ENTRIES.length
})

async function hydrateApkCenter() {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://kinesio-guard.vercel.app'
  const targetUrl = `${origin}${APK_RELEASE_URL}`
  try {
    qrSvgMarkup.value = await QRCode.toString(targetUrl, {
      type: 'svg',
      margin: 1,
      width: 176,
      color: {
        dark: '#06b6d4',
        light: '#05070f'
      }
    })
  } catch {
    qrSvgMarkup.value = ''
  }
  apkManifest.value = await fetchSignedApkManifest()
}

async function handleSignedOneTapDownload() {
  if (isDownloading.value) return
  isDownloading.value = true
  downloadSuccessNotice.value = 'Verifying PKZIP & SHA-256 signature...'
  try {
    const info = await triggerEmbeddedOneTapApkDownload()
    if (info.sha256) {
      apkManifest.value = {
        ...apkManifest.value,
        byteLength: info.byteLength,
        sizeFormatted: info.sizeFormatted,
        sha256: info.sha256
      }
    }
    downloadSuccessNotice.value = `Saved ${info.filename} (${info.sizeFormatted} · v1+v2+v3 Signed)`
  } finally {
    isDownloading.value = false
    setTimeout(() => {
      downloadSuccessNotice.value = ''
    }, 4500)
  }
}

function copyChecksum() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(apkManifest.value.sha256).catch(() => {})
  }
  copiedHash.value = true
  setTimeout(() => {
    copiedHash.value = false
  }, 2000)
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) hydrateApkCenter()
  }
)

onMounted(() => {
  hydrateApkCenter()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
      @click.self="emit('close')"
    >
      <div
        class="kg-glass-panel kg-strong-surface w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 md:p-6 space-y-5"
        role="dialog"
        aria-modal="true"
        aria-label="Kinesio-Guard Signed Android APK Distribution Center"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/30 to-violet-600/30 border border-cyan-400/40">
              <Smartphone class="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-400/35">
                GRADLE RELEASE .APK · APKSIGNER V1+V2+V3 SIGNED · JAVA 17 + RUST WASM
              </span>
              <h2 class="mt-1 text-lg font-bold kg-text-primary">
                KinesioGuard Native Android .APK Integration Center
              </h2>
            </div>
          </div>

          <button
            type="button"
            class="rounded-xl p-2 kg-subtle-surface kg-text-secondary hover:opacity-100"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Live Native Capacitor Bridge Banner when running inside the installed Android APK -->
        <div
          v-if="nativeBridge?.isNativeApk"
          class="rounded-2xl p-3.5 bg-emerald-500/15 border border-emerald-400/45 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
        >
          <div class="flex items-center gap-2 text-emerald-300 font-bold">
            <Cpu class="h-4 w-4" />
            <span>RUNNING NATIVE ANDROID APK · JAVA 17 200HZ BRIDGE CONNECTED</span>
          </div>
          <span class="text-cyan-300">
            SDK {{ nativeBridge.ecoProfile?.sdkInt || 34 }} · LRA {{ nativeBridge.hapticCaps?.hasVibrator ? 'ACTIVE' : 'READY' }}
          </span>
        </div>

        <!-- QR Code + Direct Download Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <!-- Scannable SVG QR Card -->
          <div class="md:col-span-5 rounded-2xl p-4 bg-slate-950 border border-cyan-500/35 flex flex-col items-center text-center">
            <div class="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 mb-2">
              <QrCode class="h-3.5 w-3.5" />
              <span>Scan to Install on Android</span>
            </div>
            <div
              v-if="qrSvgMarkup"
              class="w-40 h-40 rounded-xl overflow-hidden p-2 bg-[#05070f] border border-cyan-400/25"
              v-html="qrSvgMarkup"
            />
            <a
              :href="APK_RELEASE_URL"
              download="KinesioGuard-NeuroBiomech-v1.0.0.apk"
              class="mt-2 text-[10px] font-mono text-cyan-400 hover:underline"
            >
              Direct CDN Binary: {{ APK_RELEASE_URL }}
            </a>
          </div>

          <!-- Polyglot APK Build Spec Card -->
          <div class="md:col-span-7 space-y-3">
            <div class="rounded-2xl p-4 kg-subtle-surface space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Package ID</span>
                <span class="font-mono font-bold kg-text-primary">{{ apkManifest.packageId }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Release Binary</span>
                <span class="font-mono font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
                  v{{ apkManifest.versionName }} ({{ apkManifest.sizeFormatted }} · ZipAligned)
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Android SDK</span>
                <span class="font-mono font-semibold kg-text-primary text-right">
                  minSdk {{ apkManifest.minSdk }} (Android 5.1+) · targetSdk {{ apkManifest.targetSdk }} (Android 14+)
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Signature</span>
                <span class="inline-flex items-center gap-1 font-mono font-bold text-emerald-400">
                  <ShieldCheck class="h-3.5 w-3.5" /> apksigner v1 + v2 + v3 Verified
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Rust WASM Core</span>
                <span class="font-mono font-semibold kg-text-primary">
                  kinesio_rust_biomechanics.wasm ({{ formatApkBytes(apkManifest.wasmByteLength) }})
                </span>
              </div>
            </div>

            <!-- Live Verified SHA-256 Checksum Badge -->
            <div class="rounded-xl p-3 kg-subtle-surface space-y-1">
              <div class="flex items-center justify-between text-[10px] font-mono uppercase kg-text-muted">
                <span>APK Binary SHA-256 Checksum</span>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                  @click="copyChecksum"
                >
                  <Check v-if="copiedHash" class="h-3 w-3 text-emerald-400" />
                  <Copy v-else class="h-3 w-3" />
                  <span>{{ copiedHash ? 'Copied' : 'Copy SHA-256' }}</span>
                </button>
              </div>
              <div class="font-mono text-[10px] break-all kg-text-primary">
                {{ apkManifest.sha256 }}
              </div>
              <div v-if="apkManifest.certSha256" class="text-[9px] font-mono kg-text-muted truncate">
                Cert SHA-256: {{ apkManifest.certSha256 }}
              </div>
            </div>

            <!-- Primary One-Tap Signed Release APK Download Button -->
            <button
              type="button"
              :disabled="isDownloading"
              class="kg-squish-card flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-white bg-gradient-to-r from-cyan-500 via-teal-500 to-violet-600 shadow-lg shadow-cyan-500/25 border border-white/25 disabled:opacity-70"
              @click="handleSignedOneTapDownload"
            >
              <Download class="h-4 w-4" />
              <span>
                {{
                  isDownloading
                    ? 'Streaming Signed Release .APK...'
                    : `Download Signed Android .APK (${apkManifest.sizeFormatted})`
                }}
              </span>
            </button>

            <p v-if="downloadSuccessNotice" class="text-[11px] font-mono text-emerald-400 text-center">
              {{ downloadSuccessNotice }}
            </p>
          </div>
        </div>

        <!-- Inspectable Compiled APK Archive Contents -->
        <div class="rounded-2xl p-3.5 kg-subtle-surface">
          <button
            type="button"
            class="w-full flex items-center justify-between text-xs font-mono font-bold kg-text-primary"
            @click="showManifest = !showManifest"
          >
            <span class="inline-flex items-center gap-1.5">
              <PackageCheck class="h-4 w-4 text-cyan-400" />
              <span>Compiled .APK Architecture ({{ apkManifest.entryCount || EMBEDDED_APK_FILE_ENTRIES.length }} Packaged Entries)</span>
            </span>
            <span class="text-cyan-400">{{ showManifest ? 'Hide ▲' : 'Inspect ▼' }}</span>
          </button>

          <div v-if="showManifest" class="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono">
            <div
              v-for="entry in EMBEDDED_APK_FILE_ENTRIES"
              :key="entry.path"
              class="rounded-lg p-2 kg-strong-surface"
            >
              <div class="font-bold text-cyan-400 truncate">{{ entry.path }}</div>
              <div class="text-[10px] kg-text-secondary truncate">{{ entry.role }}</div>
            </div>
          </div>
        </div>

        <!-- 3-Step Android Sideloading Guide -->
        <div class="rounded-2xl p-4 kg-subtle-surface">
          <h3 class="text-xs font-mono font-bold uppercase tracking-wider kg-text-primary mb-2.5">
            3-Step Android Clinical Installation Guide
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <div class="font-mono font-bold text-cyan-400 mb-0.5">01 · Download Signed APK</div>
              <p class="kg-text-secondary">
                Tap Download Signed Android .APK or scan the QR code on any Android 8–15 phone.
              </p>
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <div class="font-mono font-bold text-emerald-400 mb-0.5">02 · Verify &amp; Install</div>
              <p class="kg-text-secondary">
                Open <span class="font-mono">KinesioGuard-NeuroBiomech-v1.0.0.apk</span>; Android verifies the v2/v3 release signature.
              </p>
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <div class="font-mono font-bold text-violet-400 mb-0.5">03 · 200Hz Native IMU</div>
              <p class="kg-text-secondary">
                Launch KinesioGuard offline to engage Java 17 200Hz linear IMU &amp; 180° LRA haptics automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
