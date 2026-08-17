type SpaceRendererPreference = 'auto' | 'image' | 'three';
type SpaceQuality = 'low' | 'balanced' | 'high';
type RoverSpeed = 'calm' | 'normal' | 'fast';

type ThreeModule = typeof import('three');

type NavigatorCapabilities = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

let installed = false;
let preference: SpaceRendererPreference = 'auto';
let quality: SpaceQuality = 'balanced';
let roverSpeed: RoverSpeed = 'normal';
let activeMode: 'image' | 'three' | null = null;
let activeHost: HTMLElement | null = null;
let activeLayer: HTMLElement | null = null;
let disposeThree: (() => void) | null = null;
let syncQueued = false;
let generation = 0;

function supportsWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function chooseSpaceRenderer(input: {
  reducedMotion: boolean;
  saveData: boolean;
  webgl2: boolean;
  hardwareConcurrency: number;
  deviceMemory: number;
  viewportWidth: number;
}) {
  if (input.reducedMotion || input.saveData || !input.webgl2) return 'image' as const;
  if (input.viewportWidth < 760) return 'image' as const;
  if (input.hardwareConcurrency < 4 || input.deviceMemory < 4) return 'image' as const;
  return 'three' as const;
}

function resolveMode(): 'image' | 'three' {
  if (preference !== 'auto') return preference;
  const nav = navigator as NavigatorCapabilities;
  return chooseSpaceRenderer({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(nav.connection?.saveData),
    webgl2: supportsWebGL2(),
    hardwareConcurrency: navigator.hardwareConcurrency || 2,
    deviceMemory: nav.deviceMemory || 4,
    viewportWidth: window.innerWidth,
  });
}

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function destroyScene() {
  generation += 1;
  disposeThree?.();
  disposeThree = null;
  activeLayer?.remove();
  activeLayer = null;
  activeHost = null;
  activeMode = null;
  delete document.documentElement.dataset.spaceActive;
}

function createImageLayer(host: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'space-experience-layer space-experience-image';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.backgroundImage = `url("${import.meta.env.BASE_URL}moon-base-space.svg")`;
  host.prepend(layer);
  return layer;
}

function addRover(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const group = new THREE.Group();
  group.name = 'family-os-rover';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd7ddeb, roughness: 0.6, metalness: 0.25 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x20283b, roughness: 0.82 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x5a7bb5, roughness: 0.24, metalness: 0.2 });
  const suitMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f3f8, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.15), bodyMaterial);
  body.position.y = 0.2;
  group.add(body);

  const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 0.75), glassMaterial);
  consoleMesh.position.set(-0.2, 0.62, 0);
  group.add(consoleMesh);

  const wheels: InstanceType<ThreeModule['Mesh']>[] = [];
  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.56, 0.56]) {
      const wheel = new THREE.Mesh(wheelGeometry, darkMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, -0.18, z);
      wheels.push(wheel);
      group.add(wheel);
    }
  }

  const astronaut = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.7, 0.38), suitMaterial);
  torso.position.y = 1.05;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 22, 16), suitMaterial);
  helmet.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.265, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), glassMaterial);
  visor.position.set(0, 1.58, 0.1);
  astronaut.add(torso, helmet, visor);
  astronaut.position.x = 0.1;
  group.add(astronaut);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8), bodyMaterial);
  mast.rotation.z = -0.55;
  mast.position.set(0.92, 1.05, 0);
  group.add(mast);
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0x71dcff, emissive: 0x2898c4, emissiveIntensity: 1.8 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), beaconMaterial);
  beacon.position.set(1.2, 1.49, 0);
  group.add(beacon);

  group.scale.setScalar(0.82);
  group.position.set(6.2, -2.15, -3.7);
  scene.add(group);
  return { group, wheels, beaconMaterial };
}

async function createThreeLayer(host: HTMLElement, layer: HTMLElement, token: number) {
  const THREE = await import('three');
  if (token !== generation || !layer.isConnected) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'space-experience-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  layer.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08091a, 0.025);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120);
  camera.position.set(0, 1.1, 10.6);
  camera.lookAt(0, -0.7, -3.4);

  let renderer: InstanceType<ThreeModule['WebGLRenderer']>;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: quality !== 'low',
      powerPreference: quality === 'high' ? 'high-performance' : 'default',
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    if (preference === 'auto') {
      preference = 'image';
      queueSync();
    }
    return;
  }

  renderer.setClearColor(0x000000, 0);
  const ratioCap = quality === 'high' ? 2 : quality === 'balanced' ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap));

  const ambient = new THREE.AmbientLight(0xa8b8ff, 1.25);
  const sun = new THREE.DirectionalLight(0xffe2c4, 3.1);
  sun.position.set(-6, 8, 6);
  const rim = new THREE.PointLight(0x6fdcff, 18, 18, 2);
  rim.position.set(6, 2, -2);
  scene.add(ambient, sun, rim);

  const starCount = quality === 'high' ? 1900 : quality === 'balanced' ? 1150 : 650;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 18 + Math.random() * 52;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.cos(phi);
    starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 18;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xe9eeff, size: quality === 'high' ? 0.075 : 0.06, transparent: true, opacity: 0.88 }));
  scene.add(stars);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(2.65, quality === 'low' ? 24 : 48, quality === 'low' ? 18 : 36),
    new THREE.MeshStandardMaterial({ color: 0x735fda, roughness: 0.72, metalness: 0.08, emissive: 0x1c123d, emissiveIntensity: 0.6 }),
  );
  planet.position.set(7.2, 3.7, -9.5);
  scene.add(planet);

  const ringed = new THREE.Group();
  const ringPlanet = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), new THREE.MeshStandardMaterial({ color: 0xc98572, roughness: 0.68 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.055, 10, 90), new THREE.MeshStandardMaterial({ color: 0xf1c79a, transparent: true, opacity: 0.72 }));
  ring.rotation.x = 1.12;
  ring.rotation.y = -0.22;
  ringed.add(ringPlanet, ring);
  ringed.position.set(2.4, 4.35, -7.8);
  scene.add(ringed);

  const groundGeometry = new THREE.PlaneGeometry(30, 11, quality === 'high' ? 58 : 32, quality === 'high' ? 24 : 14);
  const positions = groundGeometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const noise = Math.sin(x * 0.62) * 0.1 + Math.cos(y * 1.2 + x * 0.15) * 0.08 + (Math.random() - 0.5) * 0.09;
    positions.setZ(i, noise);
  }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ color: 0x717b91, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -2.55, -6.8);
  scene.add(ground);

  const craterMaterial = new THREE.MeshStandardMaterial({ color: 0x444d63, roughness: 1 });
  for (const [x, z, s] of [[-5, -4.4, 1.1], [1.3, -5.2, 0.7], [5.2, -4.8, 1.35], [-1.7, -7.2, 0.9]] as const) {
    const crater = new THREE.Mesh(new THREE.TorusGeometry(s, 0.07, 8, 36), craterMaterial);
    crater.rotation.x = Math.PI / 2;
    crater.position.set(x, -2.42, z);
    scene.add(crater);
  }

  const rover = addRover(THREE, scene);
  const clock = new THREE.Clock();
  const pointer = { x: 0, y: 0 };
  const targetPointer = { x: 0, y: 0 };

  const onPointerMove = (event: PointerEvent) => {
    targetPointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    targetPointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, Math.max(rect.height, window.innerHeight - rect.top));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const speed = roverSpeed === 'calm' ? 0.38 : roverSpeed === 'fast' ? 0.82 : 0.56;
  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();
    pointer.x += (targetPointer.x - pointer.x) * 0.025;
    pointer.y += (targetPointer.y - pointer.y) * 0.025;
    camera.position.x = pointer.x * 0.32;
    camera.position.y = 1.1 - pointer.y * 0.16;
    camera.lookAt(pointer.x * 0.15, -0.7 - pointer.y * 0.06, -3.4);
    stars.rotation.y = elapsed * 0.0035;
    stars.rotation.x = Math.sin(elapsed * 0.08) * 0.015;
    planet.rotation.y = elapsed * 0.035;
    ringed.rotation.y = Math.sin(elapsed * 0.15) * 0.08;
    ringed.position.y = 4.35 + Math.sin(elapsed * 0.22) * 0.12;
    rover.group.position.x = 7.2 - ((elapsed * speed) % 15.8);
    rover.group.position.y = -2.15 + Math.sin(elapsed * 3.2) * 0.025;
    rover.wheels.forEach(wheel => { wheel.rotation.z = -elapsed * speed * 5.2; });
    rover.beaconMaterial.emissiveIntensity = 1.2 + Math.max(0, Math.sin(elapsed * 3.6)) * 1.7;
    renderer.render(scene, camera);
  });

  disposeThree = () => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    scene.traverse(object => {
      const candidate = object as unknown as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } | Array<{ dispose?: () => void }> };
      candidate.geometry?.dispose?.();
      if (Array.isArray(candidate.material)) candidate.material.forEach(material => material.dispose?.());
      else candidate.material?.dispose?.();
    });
    renderer.dispose();
    canvas.remove();
  };
}

function mountScene(host: HTMLElement, mode: 'image' | 'three') {
  destroyScene();
  activeHost = host;
  activeMode = mode;
  document.documentElement.dataset.spaceActive = mode;
  const layer = mode === 'image' ? createImageLayer(host) : document.createElement('div');
  if (mode === 'three') {
    layer.className = 'space-experience-layer space-experience-three';
    layer.setAttribute('aria-hidden', 'true');
    host.prepend(layer);
  }
  activeLayer = layer;
  const token = generation;
  if (mode === 'three') void createThreeLayer(host, layer, token);
}

function rendererLabel(mode: 'image' | 'three') {
  return mode === 'three' ? 'Interactive Three.js' : 'Lightweight image';
}

function ensureSettingsControls() {
  const panel = document.querySelector<HTMLElement>('.settings.panel');
  if (!panel || panel.querySelector('.space-renderer-settings')) return;

  const block = document.createElement('div');
  block.className = 'setting-block space-renderer-settings';
  block.innerHTML = `
    <div>
      <b>🌕 Moon-base renderer</b>
      <span>Auto chooses the best experience for this device. Three.js is loaded only when selected.</span>
    </div>
    <div class="space-renderer-grid">
      <label>Renderer
        <select data-space-setting="renderer">
          <option value="auto">Auto · device aware</option>
          <option value="image">Image · lightweight</option>
          <option value="three">Three.js · interactive 3D</option>
        </select>
      </label>
      <label>3D quality
        <select data-space-setting="quality">
          <option value="low">Low</option>
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
        </select>
      </label>
      <label>Rover speed
        <select data-space-setting="rover">
          <option value="calm">Calm</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
      </label>
    </div>
    <small class="space-renderer-status"></small>
  `;

  const rendererSelect = block.querySelector<HTMLSelectElement>('[data-space-setting="renderer"]')!;
  const qualitySelect = block.querySelector<HTMLSelectElement>('[data-space-setting="quality"]')!;
  const roverSelect = block.querySelector<HTMLSelectElement>('[data-space-setting="rover"]')!;
  rendererSelect.value = preference;
  qualitySelect.value = quality;
  roverSelect.value = roverSpeed;

  const updateStatus = () => {
    const selected = resolveMode();
    block.querySelector<HTMLElement>('.space-renderer-status')!.textContent = preference === 'auto'
      ? `Auto selected: ${rendererLabel(selected)} for this device.`
      : `Selected: ${rendererLabel(selected)}.`;
  };
  updateStatus();

  rendererSelect.addEventListener('change', () => {
    preference = rendererSelect.value as SpaceRendererPreference;
    updateStatus();
    queueSync(true);
  });
  qualitySelect.addEventListener('change', () => {
    quality = qualitySelect.value as SpaceQuality;
    queueSync(true);
  });
  roverSelect.addEventListener('change', () => {
    roverSpeed = roverSelect.value as RoverSpeed;
    queueSync(true);
  });

  const firstThemeLabel = panel.querySelector('label');
  firstThemeLabel?.insertAdjacentElement('afterend', block);
  if (!firstThemeLabel) panel.prepend(block);
}

function syncScene(force = false) {
  ensureSettingsControls();
  const isSpace = document.documentElement.dataset.theme === 'space';
  const host = isSpace ? findTodayHost() : null;
  if (!host) {
    if (activeHost) destroyScene();
    return;
  }

  const mode = resolveMode();
  if (!force && activeHost === host && activeMode === mode && activeLayer?.isConnected) return;
  mountScene(host, mode);
}

function queueSync(force = false) {
  if (force) {
    syncScene(true);
    return;
  }
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncScene();
  });
}

export function installSpaceExperience() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const observer = new MutationObserver(() => queueSync());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
    childList: true,
    subtree: true,
  });

  window.addEventListener('resize', () => {
    if (preference === 'auto') queueSync(true);
  }, { passive: true });

  queueSync();
}
