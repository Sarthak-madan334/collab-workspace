import { useEffect, useRef } from 'react';

const COLORS = ['#54d7c1', '#a2f5dc', '#f1fff8', '#c9f06b', '#dfb96e'];
const DESKTOP_COUNT = 3200;
const MOBILE_COUNT = 1050;
const BACKGROUND_DESKTOP_COUNT = 110;
const BACKGROUND_MOBILE_COUNT = 45;
const TAU = Math.PI * 2;
const FOCAL_POSITIONS = [0.22, 0.56, 0.84];
const STREAM_SAMPLES = 1024;

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createParticles(count, background = false) {
  const random = createRandom(background ? 417 : 9217);
  return {
    count,
    t: new Float32Array(count),
    offset: new Float32Array(count),
    depth: new Float32Array(count),
    size: new Float32Array(count),
    alpha: new Float32Array(count),
    color: new Uint8Array(count),
    phase: new Float32Array(count),
    shape: new Float32Array(count),
    positionX: new Float32Array(count),
    positionY: new Float32Array(count),
    scatterX: new Float32Array(count),
    scatterY: new Float32Array(count),
    velocityX: new Float32Array(count),
    velocityY: new Float32Array(count),
    bucketCounts: new Uint16Array(background ? COLORS.length : COLORS.length * 6),
    buckets: Array.from({ length: background ? COLORS.length : COLORS.length * 6 }, () => new Uint32Array(count)),
    background,
    random,
  };
}

function createStreamGeometry(width, height) {
  const centerX = new Float32Array(STREAM_SAMPLES);
  const centerY = new Float32Array(STREAM_SAMPLES);
  const normalX = new Float32Array(STREAM_SAMPLES);
  const normalY = new Float32Array(STREAM_SAMPLES);
  const ribbonWidth = new Float32Array(STREAM_SAMPLES);
  for (let index = 0; index < STREAM_SAMPLES; index += 1) {
    const t = index / (STREAM_SAMPLES - 1);
    const tangentX = width * 1.05;
    const tangentY = height * (-0.83 + 0.298 * Math.cos(t * 8.5) + 0.342 * Math.cos(t * 19 + 0.6));
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    centerX[index] = -width * 0.025 + width * 1.05 * t;
    centerY[index] = height * (0.94 - 0.83 * t + 0.035 * Math.sin(t * 8.5) + 0.018 * Math.sin(t * 19 + 0.6));
    normalX[index] = -tangentY / tangentLength;
    normalY[index] = tangentX / tangentLength;
    ribbonWidth[index] = height * (0.045 + 0.105 * Math.pow(Math.sin(Math.PI * t), 0.8));
  }
  return { centerX, centerY, normalX, normalY, ribbonWidth };
}

function seedParticles(particles) {
  const { random } = particles;
  for (let index = 0; index < particles.count; index += 1) {
    particles.t[index] = random();
    particles.offset[index] = particles.background ? random() * 2 - 1 : (random() + random() + random() - 1.5) * 1.7;
    particles.depth[index] = random();
    particles.size[index] = particles.background ? 0.55 + random() * 0.75 : 0.55 + random() * 1.25;
    particles.alpha[index] = particles.background ? 0.07 + random() * 0.14 : 0.24 + random() * 0.5;
    particles.color[index] = particles.background ? (random() < 0.5 ? 0 : 2) : Math.floor(random() * COLORS.length);
    particles.phase[index] = random() * TAU;
    particles.shape[index] = random();
  }
}

function drawParticleBatch(context, particles, width, height, elapsed, pointer, drag, scale, geometry) {
  const { count, t, offset, depth, size, alpha, color, phase, shape, positionX, positionY, scatterX, scatterY, velocityX, velocityY, background, buckets, bucketCounts } = particles;
  const palettes = bucketCounts.length;
  bucketCounts.fill(0);

  const seconds = elapsed * 0.001;
  const flow = background ? 0 : seconds * 0.012;
  const radius = Math.min(width, height) * (background ? 0.08 : 0.2);
  const radiusSquared = radius * radius;
  const dragBoost = drag ? 2.4 : 1;
  const dt = Math.min(0.034, Math.max(0.001, (elapsed - (particles.previousElapsed || elapsed - 16)) * 0.001));
  particles.previousElapsed = elapsed;
  const damping = Math.exp(-3.2 * dt);
  const spring = background ? 0 : 7.5;
  const forward = 0.035;

  for (let index = 0; index < count; index += 1) {
    const baseT = t[index];
    const streamT = background ? baseT : (baseT + flow) % 1;
    let homeX;
    let homeY;
    let tangentX;
    let tangentY;
    let ribbonWidth;

    if (background) {
      const drift = elapsed * 0.000004 * (0.25 + depth[index] * 0.6);
      homeX = ((baseT + drift) % 1) * width;
      homeY = ((offset[index] * 0.5 + 0.5) * height + Math.sin(seconds * 0.13 + phase[index]) * 12 + height) % height;
      tangentX = 1;
      tangentY = 0;
      ribbonWidth = 1;
    } else {
      const sample = streamT * (STREAM_SAMPLES - 1);
      const sampleIndex = Math.floor(sample);
      const blend = sample - sampleIndex;
      const nextSample = Math.min(STREAM_SAMPLES - 1, sampleIndex + 1);
      const centerX = geometry.centerX[sampleIndex] + (geometry.centerX[nextSample] - geometry.centerX[sampleIndex]) * blend;
      const centerY = geometry.centerY[sampleIndex] + (geometry.centerY[nextSample] - geometry.centerY[sampleIndex]) * blend;
      const normalX = geometry.normalX[sampleIndex] + (geometry.normalX[nextSample] - geometry.normalX[sampleIndex]) * blend;
      const normalY = geometry.normalY[sampleIndex] + (geometry.normalY[nextSample] - geometry.normalY[sampleIndex]) * blend;
      ribbonWidth = geometry.ribbonWidth[sampleIndex] + (geometry.ribbonWidth[nextSample] - geometry.ribbonWidth[sampleIndex]) * blend;
      ribbonWidth *= 0.91 + shape[index] * 0.18;
      tangentX = normalY;
      tangentY = -normalX;
      const cross = offset[index] * ribbonWidth * (0.48 + depth[index] * 0.25);
      homeX = centerX + normalX * cross + (depth[index] - 0.5) * 24;
      homeY = centerY + normalY * cross;
    }

    let x = homeX + scatterX[index];
    let y = homeY + scatterY[index];
    let vx = velocityX[index];
    let vy = velocityY[index];

    if (!background && pointer.active) {
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < radiusSquared && distanceSquared > 0.01) {
        const distance = Math.sqrt(distanceSquared);
        const falloff = 1 - distance / radius;
        const speedFactor = Math.min(2.2, pointer.speed / 850);
        const force = falloff * falloff * (1250 + speedFactor * 1000) * dragBoost;
        const directionX = dx / distance + Math.max(-0.7, Math.min(0.7, pointer.velocityX / 1800)) * 0.3;
        const directionY = dy / distance + Math.max(-0.7, Math.min(0.7, pointer.velocityY / 1800)) * 0.3;
        const side = (pointer.velocityX * dy - pointer.velocityY * dx) / (distance * Math.max(800, pointer.speed));
        vx += (directionX * force - (dy / distance) * side * 170 * falloff) * dt;
        vy += (directionY * force + (dx / distance) * side * 170 * falloff) * dt;
      }
    }

    if (!background) {
      vx += (-scatterX[index] * spring + tangentX / (width + height) * forward * ribbonWidth * 70) * dt;
      vy += (-scatterY[index] * spring + tangentY / (width + height) * forward * ribbonWidth * 70) * dt;
      vx *= damping;
      vy *= damping;
      scatterX[index] += vx * dt;
      scatterY[index] += vy * dt;
      const displacementSquared = scatterX[index] * scatterX[index] + scatterY[index] * scatterY[index];
      if (displacementSquared > radius * radius * 1.96) {
        const displacement = Math.sqrt(displacementSquared);
        const limit = radius * 1.4 / displacement;
        scatterX[index] *= limit;
        scatterY[index] *= limit;
      }
      velocityX[index] = vx;
      velocityY[index] = vy;
      x = homeX + scatterX[index];
      y = homeY + scatterY[index];
    }

    const perspective = 0.58 + depth[index] * 0.72;
    const breathe = 0.82 + 0.18 * Math.sin(seconds * (0.65 + depth[index] * 0.4) + phase[index]);
    const edgeFade = background ? 1 : Math.min(1, streamT * 4.5, (1 - streamT) * 5);
    const textFade = background ? 1 : 0.3 + 0.7 * Math.min(1, Math.max(0, (x / width - 0.08) * 2.2));
    const visibleAlpha = alpha[index] * breathe * edgeFade * textFade * (background ? 1 : 0.86 + depth[index] * 0.14);
    positionX[index] = x;
    positionY[index] = y;
    if (visibleAlpha < 0.035 || x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;

    let bucket;
    if (background) bucket = color[index];
    else bucket = color[index] * 6 + Math.min(5, Math.floor(visibleAlpha * 6));
    const position = bucketCounts[bucket];
    buckets[bucket][position] = index;
    bucketCounts[bucket] = position + 1;
  }

  for (let bucket = 0; bucket < palettes; bucket += 1) {
    const used = bucketCounts[bucket];
    if (!used) continue;
    if (background) {
      context.fillStyle = bucket === 2 ? 'rgba(207,225,218,.46)' : 'rgba(107,171,155,.5)';
    } else {
      context.fillStyle = COLORS[Math.floor(bucket / 6)];
      context.globalAlpha = 0.16 + (bucket % 6) * 0.13;
    }
    context.beginPath();
    for (let item = 0; item < used; item += 1) {
      const index = buckets[bucket][item];
      const x = positionX[index];
      const y = positionY[index];
      const radius = Math.max(0.42, size[index] * (0.58 + depth[index] * 0.72) * scale);
      context.rect(x - radius, y - radius, radius * 2, radius * 2);
    }
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawFocals(context, width, height, elapsed, pointer, scale) {
  const seconds = elapsed * 0.001;
  for (let index = 0; index < FOCAL_POSITIONS.length; index += 1) {
    const t = FOCAL_POSITIONS[index];
    const x = -width * 0.025 + width * 1.05 * t;
    const y = height * (0.94 - 0.83 * t + 0.035 * Math.sin(t * 8.5) + 0.018 * Math.sin(t * 19 + 0.6));
    const pulse = 0.5 + 0.5 * Math.sin(seconds * 0.75 + index * 2.1);
    const distance = pointer.active ? Math.hypot(pointer.x - x, pointer.y - y) : Infinity;
    const response = Math.max(0, 1 - distance / Math.min(width, height) * 0.32);
    const radius = (2.2 + pulse * 0.8 + response * 2) * scale;
    context.globalAlpha = 0.4 + pulse * 0.2 + response * 0.22;
    context.fillStyle = index === 1 ? '#edcf94' : '#c9f6e4';
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
    context.globalAlpha = 0.13 + pulse * 0.055 + response * 0.09;
    context.strokeStyle = index === 1 ? '#d9b772' : '#8be8d1';
    context.lineWidth = 0.75 * scale;
    for (let ring = 0; ring < 2; ring += 1) {
      context.beginPath();
      context.arc(x, y, (9 + ring * 10 + pulse * 2 + response * (ring + 1) * 5) * scale, 0, TAU);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
}

export default function ParticleStream() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const interactionTarget = container?.parentElement;
    const context = canvas?.getContext('2d', { alpha: true, desynchronized: true });
    if (!canvas || !container || !interactionTarget || !context) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0, y: 0, velocityX: 0, velocityY: 0, speed: 0, active: false, dragging: false, lastX: 0, lastY: 0, lastTime: 0 };
    let stream = createParticles(0);
    let background = createParticles(0, true);
    let geometry;
    let width = 0;
    let height = 0;
    let scale = 1;
    let frameId = 0;
    let elapsed = 0;
    let previousFrame = 0;
    let inView = true;
    let isHidden = document.hidden;
    let disposed = false;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      geometry = createStreamGeometry(width, height);
      const mobile = width < 620;
      const dprCap = mobile ? 1.3 : 1.65;
      scale = Math.min(dprCap, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const streamCount = mobile ? MOBILE_COUNT : DESKTOP_COUNT;
      const backgroundCount = mobile ? BACKGROUND_MOBILE_COUNT : BACKGROUND_DESKTOP_COUNT;
      if (stream.count !== streamCount) {
        stream = createParticles(streamCount);
        background = createParticles(backgroundCount, true);
        seedParticles(stream);
        seedParticles(background);
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      render(performance.now());
    };

    const render = (now) => {
      if (disposed) return;
      const dt = previousFrame ? Math.min(48, now - previousFrame) : 16;
      previousFrame = now;
      if (!reducedMotion.matches) elapsed += dt;
      context.clearRect(0, 0, width, height);
      drawParticleBatch(context, background, width, height, elapsed, pointer, false, scale, geometry);
      drawParticleBatch(context, stream, width, height, elapsed, pointer, pointer.dragging, scale, geometry);
      drawFocals(context, width, height, elapsed, pointer, scale);
    };

    const shouldRun = () => !disposed && !isHidden && inView;
    const tick = (now) => {
      frameId = 0;
      if (!shouldRun()) return;
      render(now);
      if (!reducedMotion.matches) frameId = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!shouldRun() || frameId) return;
      if (reducedMotion.matches) {
        render(performance.now());
        return;
      }
      previousFrame = 0;
      frameId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    };
    const updateRunState = () => {
      if (shouldRun()) start();
      else stop();
    };

    const pointFromEvent = (event) => {
      const rect = canvas.getBoundingClientRect();
      const now = performance.now();
      const nextX = event.clientX - rect.left;
      const nextY = event.clientY - rect.top;
      const elapsedMs = Math.max(8, now - (pointer.lastTime || now - 16));
      pointer.velocityX = (nextX - pointer.lastX) / elapsedMs * 1000;
      pointer.velocityY = (nextY - pointer.lastY) / elapsedMs * 1000;
      pointer.speed = Math.hypot(pointer.velocityX, pointer.velocityY);
      pointer.x = nextX;
      pointer.y = nextY;
      pointer.lastX = nextX;
      pointer.lastY = nextY;
      pointer.lastTime = now;
      pointer.active = true;
    };
    const onPointerMove = (event) => pointFromEvent(event);
    const onPointerDown = (event) => {
      pointFromEvent(event);
      pointer.dragging = true;
    };
    const onPointerUp = () => { pointer.dragging = false; };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.dragging = false;
      pointer.speed = 0;
    };
    const onVisibility = () => {
      isHidden = document.hidden;
      updateRunState();
    };
    const onMotionPreference = () => {
      stop();
      previousFrame = 0;
      render(performance.now());
      updateRunState();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateRunState();
    }, { threshold: 0 });
    intersectionObserver.observe(container);
    interactionTarget.addEventListener('pointermove', onPointerMove, { passive: true });
    interactionTarget.addEventListener('pointerdown', onPointerDown, { passive: true });
    interactionTarget.addEventListener('pointerup', onPointerUp, { passive: true });
    interactionTarget.addEventListener('pointercancel', onPointerUp, { passive: true });
    interactionTarget.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener?.('change', onMotionPreference);
    window.addEventListener('resize', resize, { passive: true });

    resize();
    updateRunState();

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      interactionTarget.removeEventListener('pointermove', onPointerMove);
      interactionTarget.removeEventListener('pointerdown', onPointerDown);
      interactionTarget.removeEventListener('pointerup', onPointerUp);
      interactionTarget.removeEventListener('pointercancel', onPointerUp);
      interactionTarget.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener?.('change', onMotionPreference);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <div ref={containerRef} className="particle-stream-layer" aria-hidden="true">
    <canvas ref={canvasRef} className="particle-stream-canvas" />
  </div>;
}
