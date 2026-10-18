import { useEffect, useRef } from 'react';
import './FlowWaveBackground.css';

const SIMPLEX_NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m *= m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const WAVE_VERTEX_SHADER = `${SIMPLEX_NOISE}
uniform float uTime;
uniform float uScale;
uniform float uHeight;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uOpacity;
uniform vec2 uPointer;
uniform float uInteraction;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 point = position;
  vec3 samplePoint = vec3(point.xz * uScale * 0.2, uTime * 0.12);
  float broad = snoise(samplePoint);
  float detail = snoise(samplePoint * 1.8 + vec3(4.7, 2.1, -uTime * 0.08)) * 0.22;
  float height = (broad + detail) * uHeight;
  vec2 difference = point.xz - uPointer;
  float distanceToPointer = length(difference);
  float influence = (1.0 - smoothstep(0.0, 12.0, distanceToPointer)) * uInteraction;
  vec2 direction = difference / max(distanceToPointer, 0.001);
  point.xz += direction * influence * 1.35;
  point.y = height + influence * 1.05;
  float peak = smoothstep(-0.25, 1.55, height);
  vColor = mix(vec3(0.008, 0.075, 0.04), vec3(0.055, 0.63, 0.36), peak);
  vAlpha = uOpacity * (0.52 + peak * 0.48);
  vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uPointSize * uPixelRatio * (24.0 / max(24.0, -viewPosition.z));
}
`;

const WAVE_FRAGMENT_SHADER = `
uniform float uBrightness;
uniform float uSceneStrength;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float radius = length(gl_PointCoord - vec2(0.5));
  float core = 1.0 - smoothstep(0.08, 0.5, radius);
  float halo = 1.0 - smoothstep(0.12, 0.5, radius);
  float alpha = (core * 0.75 + halo * 0.25) * vAlpha * uSceneStrength;
  gl_FragColor = vec4(vColor * (0.55 + uBrightness), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const MOTE_VERTEX_SHADER = `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vec3 mote = position;
  mote.x += sin(uTime * 0.22 + position.z * 0.08) * 0.65;
  mote.y += sin(uTime * 0.3 + position.x * 0.11) * 0.45;
  vAlpha = 0.22 + 0.18 * sin(uTime * 0.6 + position.z);
  vec4 viewPosition = modelViewMatrix * vec4(mote, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSize * uPixelRatio * (12.0 / max(12.0, -viewPosition.z));
}
`;

const MOTE_FRAGMENT_SHADER = `
uniform float uSceneStrength;
varying float vAlpha;
void main() {
  float radius = length(gl_PointCoord - vec2(0.5));
  float glow = 1.0 - smoothstep(0.05, 0.5, radius);
  gl_FragColor = vec4(0.38, 1.0, 0.72, glow * vAlpha * uSceneStrength);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createMotes(THREE, count) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 105;
    positions[index * 3 + 1] = 3 + Math.random() * 19;
    positions[index * 3 + 2] = (Math.random() - 0.5) * 76;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export default function FlowWaveBackground({ mode = 'hero', enabled = true }) {
  const hostRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return undefined;

    let cancelled = false;
    let cleanupScene = () => {};
    import('three').then((THREE) => {
      if (cancelled) return;

    let renderer;
    let animationFrame = 0;
    let resizeObserver;
    let disposed = false;
    let elapsed = 0;
    let previousTime = 0;
    let scrollProgress = 0;
    let targetInteraction = 0;
    let desiredPointer = new THREE.Vector2(0, 0);
    const smoothPointer = new THREE.Vector2(0, 0);
    const pointerNdc = new THREE.Vector2(0, 0);
    const raycaster = new THREE.Raycaster();
    const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointerWorld = new THREE.Vector3();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const smallScreen = window.matchMedia('(max-width: 700px)');
    const isReduced = reducedMotion.matches;
    const isSmall = smallScreen.matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, isSmall ? 1.15 : 1.6);
    const countX = isSmall ? 108 : 190;
    const countZ = isSmall ? 72 : 128;
    const moteCount = isSmall ? 105 : 300;
    const waveGeometry = new THREE.PlaneGeometry(116, 78, countX - 1, countZ - 1);
    waveGeometry.rotateX(-Math.PI / 2);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 180);
    camera.position.set(0, 13, 34);
    camera.lookAt(0, 0, -5);
    const waveUniforms = {
      uTime: { value: 0 },
      uScale: { value: 0.275 },
      uHeight: { value: 3 },
      uPointSize: { value: 5.5 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: 0.26 },
      uBrightness: { value: 0.45 },
      uSceneStrength: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uInteraction: { value: 0 },
    };
    const waveMaterial = new THREE.ShaderMaterial({
      uniforms: waveUniforms,
      vertexShader: WAVE_VERTEX_SHADER,
      fragmentShader: WAVE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wave = new THREE.Points(waveGeometry, waveMaterial);
    wave.frustumCulled = false;
    scene.add(wave);

    const moteUniforms = {
      uTime: { value: 0 },
      uSize: { value: isSmall ? 18 : 24 },
      uPixelRatio: { value: pixelRatio },
      uSceneStrength: { value: 0 },
    };
    const moteGeometry = createMotes(THREE, moteCount);
    const moteMaterial = new THREE.ShaderMaterial({
      uniforms: moteUniforms,
      vertexShader: MOTE_VERTEX_SHADER,
      fragmentShader: MOTE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const motes = new THREE.Points(moteGeometry, moteMaterial);
    motes.frustumCulled = false;
    scene.add(motes);

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isSmall, powerPreference: 'low-power' });
      renderer.setPixelRatio(pixelRatio);
      renderer.setClearColor(0x02160c, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.appendChild(renderer.domElement);
      host.dataset.ready = 'true';
    } catch {
      host.dataset.failed = 'true';
      waveGeometry.dispose();
      waveMaterial.dispose();
      moteGeometry.dispose();
      moteMaterial.dispose();
      return undefined;
    }

    const resize = () => {
      if (disposed || !renderer) return;
      const width = Math.max(1, host.clientWidth || window.innerWidth);
      const height = Math.max(1, host.clientHeight || window.innerHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const updateScroll = () => {
      const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollProgress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
    };
    const updatePointer = (event) => {
      pointerNdc.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(pointerNdc, camera);
      if (raycaster.ray.intersectPlane(pointerPlane, pointerWorld)) {
        desiredPointer.set(pointerWorld.x, pointerWorld.z);
        targetInteraction = 1;
      }
    };
    const leavePointer = () => { targetInteraction = 0; };
    const visibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else if (!isReduced && !animationFrame) {
        previousTime = 0;
        animationFrame = requestAnimationFrame(render);
      }
    };

    const render = (now) => {
      animationFrame = 0;
      if (disposed || document.hidden) return;
      const delta = previousTime ? Math.min(0.05, (now - previousTime) / 1000) : 0;
      previousTime = now;
      if (!isReduced) elapsed += delta;

      const isWorkspace = modeRef.current === 'workspace';
      const targetStrength = modeRef.current === 'hero' ? 1 : isWorkspace ? 0.42 : 0.76;
      const strengthBlend = isReduced ? 1 : 1 - Math.exp(-delta * 2.2);
      waveUniforms.uSceneStrength.value += (targetStrength - waveUniforms.uSceneStrength.value) * strengthBlend;
      waveUniforms.uInteraction.value += (targetInteraction - waveUniforms.uInteraction.value) * (isReduced ? 1 : 1 - Math.exp(-delta * 5));
      moteUniforms.uSceneStrength.value = waveUniforms.uSceneStrength.value * 0.72;
      smoothPointer.lerp(desiredPointer, 1 - Math.exp(-delta * 5));
      waveUniforms.uPointer.value.copy(smoothPointer);
      waveUniforms.uTime.value = elapsed;
      moteUniforms.uTime.value = elapsed;

      const easedScroll = scrollProgress * scrollProgress * (3 - 2 * scrollProgress);
      const targetY = 13 - easedScroll * 6;
      const targetZ = 34 - easedScroll * 9;
      const pointerLookX = isReduced ? 0 : pointerNdc.x * 1.15;
      const pointerLookY = isReduced ? 0 : pointerNdc.y * 0.42;
      camera.position.x += (pointerLookX - camera.position.x) * (1 - Math.exp(-delta * 1.5));
      camera.position.y += (targetY + pointerLookY - camera.position.y) * (1 - Math.exp(-delta * 1.2));
      camera.position.z += (targetZ - camera.position.z) * (1 - Math.exp(-delta * 1.2));
      camera.lookAt(pointerLookX * 0.35, -1 + easedScroll * 0.5, -5);
      renderer.render(scene, camera);
      if (!isReduced) animationFrame = requestAnimationFrame(render);
    };

    resize();
    updateScroll();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerleave', leavePointer, { passive: true });
    document.addEventListener('visibilitychange', visibilityChange);
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => { resize(); updateScroll(); });
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }
    if (isReduced) render(performance.now());
    else animationFrame = requestAnimationFrame(render);

    cleanupScene = () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerleave', leavePointer);
      document.removeEventListener('visibilitychange', visibilityChange);
      waveGeometry.dispose();
      waveMaterial.dispose();
      moteGeometry.dispose();
      moteMaterial.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      delete host.dataset.ready;
      delete host.dataset.failed;
    };
    }).catch(() => {
      if (!cancelled) host.dataset.failed = 'true';
    });

    return () => {
      cancelled = true;
      cleanupScene();
      delete host.dataset.ready;
      delete host.dataset.failed;
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={hostRef} className="flow-wave-background" data-mode={mode} aria-hidden="true" />;
}