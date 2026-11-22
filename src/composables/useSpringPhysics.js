import { ref, onUnmounted } from 'vue'

/**
 * Hooke's Law Spring Differential Equation Composable (Pure ES2024, 0% TypeScript)
 * Solves: m * x'' + c * x' + k * (x - target) = 0
 * Default biomechanical feel: stiffness = 320, damping = 25, mass = 0.8
 */
export function useSpringValue(initialValue = 0, options = {}) {
  const stiffness = options.stiffness ?? 320
  const damping = options.damping ?? 25
  const mass = options.mass ?? 0.8
  const precision = options.precision ?? 0.001

  const current = ref(initialValue)
  const velocity = ref(0)
  let targetValue = initialValue
  let rafId = null
  let lastTime = 0

  function stepFrame(now) {
    if (!lastTime) {
      lastTime = now
    }
    const rawDt = (now - lastTime) / 1000
    lastTime = now
    // Sub-step integration keeps high-stiffness springs unconditionally stable even on frame drops
    const clampedDt = Math.min(0.034, Math.max(0.001, rawDt))
    const subSteps = 2
    const dt = clampedDt / subSteps

    let pos = current.value
    let vel = velocity.value

    for (let s = 0; s < subSteps; s++) {
      const springForce = -stiffness * (pos - targetValue)
      const dampingForce = -damping * vel
      const accel = (springForce + dampingForce) / mass
      vel += accel * dt
      pos += vel * dt
    }

    if (Math.abs(pos - targetValue) < precision && Math.abs(vel) < precision) {
      current.value = targetValue
      velocity.value = 0
      rafId = null
      lastTime = 0
      return
    }

    current.value = pos
    velocity.value = vel
    rafId = requestAnimationFrame(stepFrame)
  }

  function setTarget(nextTarget, immediate = false) {
    targetValue = nextTarget
    if (immediate) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      current.value = nextTarget
      velocity.value = 0
      lastTime = 0
      return
    }
    if (rafId === null && typeof requestAnimationFrame !== 'undefined') {
      lastTime = 0
      rafId = requestAnimationFrame(stepFrame)
    } else if (typeof requestAnimationFrame === 'undefined') {
      current.value = nextTarget
    }
  }

  function impulse(velocityBoost = 12) {
    velocity.value += velocityBoost
    if (rafId === null && typeof requestAnimationFrame !== 'undefined') {
      lastTime = 0
      rafId = requestAnimationFrame(stepFrame)
    }
  }

  onUnmounted(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  return {
    current,
    velocity,
    setTarget,
    impulse
  }
}

/**
 * Coupled 2D Cartesian Spring Solver for Romberg Sway Crosshairs & Kalman Anti-Tremor Lenses.
 */
export function useSpring2D(initialX = 0, initialY = 0, options = {}) {
  const springX = useSpringValue(initialX, options)
  const springY = useSpringValue(initialY, options)

  function setTarget2D(x, y, immediate = false) {
    springX.setTarget(x, immediate)
    springY.setTarget(y, immediate)
  }

  return {
    x: springX.current,
    y: springY.current,
    vx: springX.velocity,
    vy: springY.velocity,
    setTarget2D
  }
}
