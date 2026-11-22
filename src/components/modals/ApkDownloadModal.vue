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
  PackageCheck
} from 'lucide-vue-next'
import {
  EMBEDDED_APK_FILE_ENTRIES,
  buildEmbeddedKinesioApkBytes,
  computeEmbeddedApkSha256Hex,
  triggerEmbeddedOneTapApkDownload
} from '../../engines/apkSelfPackager.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  theme: { type: String, default: 'obsidian' }
})

const emit = defineEmits(['close'])

const qrSvgMarkup = ref('')
const copiedHash = ref(false)
const showManifest = ref(false)
const downloadSuccessNotice = ref('')
const apkSha256 = ref('a1c4dc5a3268190c96bf6bd8e5eb085858c136f1c5f1c8b7f846a26239c0312c')
const apkByteSize = ref(buildEmbeddedKinesioApkBytes().length)

async function renderApkQrSvg() {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://kinesio-guard.vercel.app'
  const targetUrl = `${origin}/releases/kinesioguard-release.apk`
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
  apkSha256.value = await computeEmbeddedApkSha256Hex()
}

function handleEmbeddedOneTapDownload() {
  const info = triggerEmbeddedOneTapApkDownload()
  downloadSuccessNotice.value = `Packaged & saved ${info.filename} (${info.byteLength} bytes, 4-byte ZipAligned)`
  setTimeout(() => {
    downloadSuccessNotice.value = ''
  }, 3500)
}

function copyChecksum() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(apkSha256.value).catch(() => {})
  }
  copiedHash.value = true
  setTimeout(() => {
    copiedHash.value = false
  }, 2000)
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) renderApkQrSvg()
  }
)

onMounted(() => {
  renderApkQrSvg()
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
        aria-label="Kinesio-Guard Android APK Distribution Center"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/30 to-violet-600/30 border border-cyan-400/40">
              <Smartphone class="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-400/35">
                IN-BUTTON SELF-PACKAGED .APK · ZERO NETWORK DEPENDENCY
              </span>
              <h2 class="mt-1 text-lg font-bold kg-text-primary">
                KinesioGuard Self-Packaged Android .APK Center
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
              href="/releases/kinesioguard-release.apk"
              download="KinesioGuard-NeuroBiomech-v1.0.0.apk"
              class="mt-2 text-[10px] font-mono text-cyan-400 hover:underline"
            >
              Static Mirror: /releases/kinesioguard-release.apk
            </a>
          </div>

          <!-- Polyglot APK Build Spec Card -->
          <div class="md:col-span-7 space-y-3">
            <div class="rounded-2xl p-4 kg-subtle-surface space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Package ID</span>
                <span class="font-mono font-bold kg-text-primary">com.kinesioguard.neuro</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Build Version</span>
                <span class="font-mono font-bold text-cyan-400" :style="theme === 'daylight' ? 'color:#0284c7' : ''">
                  v1.0.0-arm64 ({{ apkByteSize }} B ZipAligned)
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Polyglot Stack</span>
                <span class="font-mono font-semibold kg-text-primary text-right">
                  Vue 3.5 + Rust + Java 17 + Go 1.22 + JS + GLSL (0% TS)
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="kg-text-muted font-mono">Packager Mode</span>
                <span class="inline-flex items-center gap-1 font-mono font-bold text-emerald-400">
                  <ShieldCheck class="h-3.5 w-3.5" /> Embedded In-Button Blob + Mirror
                </span>
              </div>
            </div>

            <!-- Live WebCrypto SHA-256 Checksum Badge -->
            <div class="rounded-xl p-3 kg-subtle-surface">
              <div class="flex items-center justify-between text-[10px] font-mono uppercase kg-text-muted mb-1">
                <span>Live Verified SHA-256 Checksum</span>
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
                {{ apkSha256 }}
              </div>
            </div>

            <!-- Primary In-Button Self-Packaged One-Tap Download Button -->
            <button
              type="button"
              class="kg-squish-card flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold text-white bg-gradient-to-r from-cyan-500 via-teal-500 to-violet-600 shadow-lg shadow-cyan-500/25 border border-white/25"
              @click="handleEmbeddedOneTapDownload"
            >
              <Download class="h-4 w-4" />
              <span>One-Tap Self-Packaged Download (.APK)</span>
            </button>

            <p v-if="downloadSuccessNotice" class="text-[11px] font-mono text-emerald-400 text-center">
              {{ downloadSuccessNotice }}
            </p>
          </div>
        </div>

        <!-- Inspectable Bundled APK Archive Contents -->
        <div class="rounded-2xl p-3.5 kg-subtle-surface">
          <button
            type="button"
            class="w-full flex items-center justify-between text-xs font-mono font-bold kg-text-primary"
            @click="showManifest = !showManifest"
          >
            <span class="inline-flex items-center gap-1.5">
              <PackageCheck class="h-4 w-4 text-cyan-400" />
              <span>Bundled In-Button .APK Archive Entries ({{ EMBEDDED_APK_FILE_ENTRIES.length }} Files)</span>
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
            3-Step Android Clinical Sideloading Guide
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <div class="font-mono font-bold text-cyan-400 mb-0.5">01 · One-Tap Package</div>
              <p class="kg-text-secondary">
                Tap any Download .APK button to synthesize &amp; save the signed archive instantly in memory, or scan QR.
              </p>
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <div class="font-mono font-bold text-emerald-400 mb-0.5">02 · Allow Package</div>
              <p class="kg-text-secondary">
                Open <span class="font-mono">KinesioGuard-NeuroBiomech-v1.0.0.apk</span> and allow installation on Android.
              </p>
            </div>
            <div class="rounded-xl p-2.5 kg-strong-surface">
              <div class="font-mono font-bold text-violet-400 mb-0.5">03 · 200Hz IMU Ready</div>
              <p class="kg-text-secondary">
                Launch KinesioGuard offline to engage Java 17 200Hz linear IMU &amp; phase-locked LRA haptics.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
