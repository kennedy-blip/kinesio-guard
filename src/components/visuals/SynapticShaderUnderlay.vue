<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import fragmentShaderSource from '../../shaders/synaptic_kinematics.glsl?raw'

const props = defineProps({
  stressLevel: { type: Number, default: 0.12 },
  tremorHz: { type: Number, default: 7.4 },
  flexionRatio: { type: Number, default: 0.18 },
  theme: { type: String, default: 'obsidian' },
  pointerX: { type: Number, default: 0.5 },
  pointerY: { type: Number, default: 0.35 }
})

const canvasRef = ref(null)
const webglReady = ref(false)

let gl = null
let program = null
let rafId = null
let startTime = 0
let smoothStress = props.stressLevel
let smoothHz = props.tremorHz
let smoothFlexion = props.flexionRatio
let smoothPtrX = props.pointerX
let smoothPtrY = props.pointerY
let uniforms = {}

const VERTEX_SHADER_ES300 = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

function compileShader(context, type, source) {
  const shader = context.createShader(type)
  if (!shader) return null
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    context.deleteShader(shader)
    return null
  }
  return shader
}

function themeToNumericMode(themeName) {
  if (themeName === 'daylight') return 1.0
  if (themeName === 'amber') return 2.0
  return 0.0
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !gl) return
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const w = Math.max(1, Math.floor(window.innerWidth * dpr))
  const h = Math.max(1, Math.floor(window.innerHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
  }
}

function renderLoop(now) {
  if (props.theme === 'eco' || !gl || !program) {
    rafId = null
    return
  }
  if (!startTime) startTime = now
  const elapsedSec = (now - startTime) * 0.001

  smoothStress += (props.stressLevel - smoothStress) * 0.06
  smoothHz += (props.tremorHz - smoothHz) * 0.06
  smoothFlexion += (props.flexionRatio - smoothFlexion) * 0.06
  smoothPtrX += (props.pointerX - smoothPtrX) * 0.08
  smoothPtrY += (1 - props.pointerY - smoothPtrY) * 0.08

  gl.useProgram(program)
  gl.uniform2f(uniforms.u_resolution, gl.canvas.width, gl.canvas.height)
  gl.uniform1f(uniforms.u_time, elapsedSec)
  gl.uniform2f(uniforms.u_pointer, smoothPtrX, smoothPtrY)
  gl.uniform1f(uniforms.u_stressLevel, smoothStress)
  gl.uniform1f(uniforms.u_tremorHz, smoothHz)
  gl.uniform1f(uniforms.u_flexionRatio, smoothFlexion)
  gl.uniform1f(uniforms.u_themeMode, themeToNumericMode(props.theme))

  gl.drawArrays(gl.TRIANGLES, 0, 6)
  rafId = requestAnimationFrame(renderLoop)
}

function initWebGL2() {
  const canvas = canvasRef.value
  if (!canvas) return
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power'
  })
  if (!context) {
    webglReady.value = false
    return
  }

  const vs = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER_ES300)
  const fs = compileShader(context, context.FRAGMENT_SHADER, fragmentShaderSource)
  if (!vs || !fs) {
    webglReady.value = false
    return
  }

  const prog = context.createProgram()
  context.attachShader(prog, vs)
  context.attachShader(prog, fs)
  context.linkProgram(prog)
  if (!context.getProgramParameter(prog, context.LINK_STATUS)) {
    webglReady.value = false
    return
  }

  const posBuffer = context.createBuffer()
  context.bindBuffer(context.ARRAY_BUFFER, posBuffer)
  context.bufferData(
    context.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    context.STATIC_DRAW
  )

  const vao = context.createVertexArray()
  context.bindVertexArray(vao)
  const posLoc = context.getAttribLocation(prog, 'a_position')
  context.enableVertexAttribArray(posLoc)
  context.vertexAttribPointer(posLoc, 2, context.FLOAT, false, 0, 0)

  uniforms = {
    u_resolution: context.getUniformLocation(prog, 'u_resolution'),
    u_time: context.getUniformLocation(prog, 'u_time'),
    u_pointer: context.getUniformLocation(prog, 'u_pointer'),
    u_stressLevel: context.getUniformLocation(prog, 'u_stressLevel'),
    u_tremorHz: context.getUniformLocation(prog, 'u_tremorHz'),
    u_flexionRatio: context.getUniformLocation(prog, 'u_flexionRatio'),
    u_themeMode: context.getUniformLocation(prog, 'u_themeMode')
  }

  gl = context
  program = prog
  webglReady.value = true
  resizeCanvas()

  if (props.theme !== 'eco') {
    rafId = requestAnimationFrame(renderLoop)
  }
}

watch(
  () => props.theme,
  (nextTheme) => {
    if (nextTheme === 'eco') {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    } else if (gl && program && !rafId) {
      rafId = requestAnimationFrame(renderLoop)
    }
  }
)

onMounted(() => {
  initWebGL2()
  window.addEventListener('resize', resizeCanvas, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" style="will-change: transform">
    <!-- GPU-Accelerated WebGL2 Synaptic Kinematics Tensor Shader -->
    <canvas
      v-show="theme !== 'eco' && webglReady"
      ref="canvasRef"
      class="h-full w-full block"
      style="will-change: transform"
    />

    <!-- CSS Fallback / Eco-Glass Low-GPU Matte Acrylic Gradient -->
    <div
      v-if="theme === 'eco' || !webglReady"
      class="h-full w-full transition-colors duration-500"
      :class="{
        'bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/50': theme === 'eco' || theme === 'obsidian',
        'bg-gradient-to-br from-slate-100 via-sky-50 to-indigo-50': theme === 'daylight',
        'bg-gradient-to-br from-stone-950 via-amber-950/60 to-orange-950/40': theme === 'amber'
      }"
    />

    <!-- Global 3.5% Opacity Frosted Acrylic Medical-Quartz SVG Noise Overlay -->
    <svg
      class="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.035]"
      aria-hidden="true"
    >
      <filter id="kg-quartz-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.82"
          numOctaves="3"
          stitchTiles="stitch"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#kg-quartz-grain)" />
    </svg>
  </div>
</template>
