type ThreeModule = typeof import('three');

type Disposable = { dispose?: () => void };

type CloudLayer = {
  group: InstanceType<ThreeModule['Group']>;
  mesh: InstanceType<ThreeModule['InstancedMesh']>;
  baseX: number;
  baseY: number;
  speed: number;
  sway: number;
};

let activeDispose: (() => void) | null = null;
let generation = 0;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function seededRandom(seed = 0x8f41c2a7) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createCloudMaterials(THREE: ThreeModule) {
  const front = new THREE.MeshPhysicalMaterial({
    color: 0xf5edf4,
    roughness: 0.92,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.7,
    sheen: 0.38,
    sheenColor: new THREE.Color(0xffbfd3),
    sheenRoughness: 0.72,
  });

  const middle = new THREE.MeshPhysicalMaterial({
    color: 0xeadce9,
    roughness: 0.95,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.78,
    sheen: 0.32,
    sheenColor: new THREE.Color(0xf6b5d2),
    sheenRoughness: 0.78,
  });

  const back = new THREE.MeshPhysicalMaterial({
    color: 0xd6ddef,
    roughness: 0.96,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.82,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xb7dfff),
    sheenRoughness: 0.82,
  });

  return { front, middle, back };
}

type CloudCenter = {
  x: number;
  y: number;
  z: number;
  radius: number;
  puffs: number;
  vertical?: number;
  depth?: number;
};

function addCloudLayer(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  geometry: InstanceType<ThreeModule['SphereGeometry']>,
  material: InstanceType<ThreeModule['MeshPhysicalMaterial']>,
  centers: CloudCenter[],
  random: () => number,
  motion: { speed: number; sway: number },
): CloudLayer {
  const total = centers.reduce((sum, center) => sum + center.puffs, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, total);
  const dummy = new THREE.Object3D();
  let instanceIndex = 0;

  for (const center of centers) {
    for (let puff = 0; puff < center.puffs; puff += 1) {
      const angle = random() * Math.PI * 2;
      const radial = Math.pow(random(), 0.62) * center.radius;
      const vertical = center.vertical ?? center.radius * 0.55;
      const depth = center.depth ?? center.radius * 0.8;

      const x = center.x + Math.cos(angle) * radial;
      const y = center.y + (random() - 0.38) * vertical + Math.max(0, 1 - radial / Math.max(0.001, center.radius)) * center.radius * 0.32;
      const z = center.z + (random() - 0.5) * depth;
      const size = center.radius * (0.34 + random() * 0.42);

      dummy.position.set(x, y, z);
      dummy.scale.set(
        size * (0.92 + random() * 0.72),
        size * (0.72 + random() * 0.52),
        size * (0.9 + random() * 0.68),
      );
      dummy.rotation.set(
        (random() - 0.5) * 0.12,
        random() * Math.PI,
        (random() - 0.5) * 0.12,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);
      instanceIndex += 1;
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;

  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  return {
    group,
    mesh,
    baseX: group.position.x,
    baseY: group.position.y,
    speed: motion.speed,
    sway: motion.sway,
  };
}

function addCloudscape(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const geometry = new THREE.SphereGeometry(1, 22, 16);
  const materials = createCloudMaterials(THREE);

  const backCenters: CloudCenter[] = [
    { x: -13.5, y: 4.1, z: -28, radius: 3.7, puffs: 14 },
    { x: -7.3, y: 4.8, z: -29, radius: 3.2, puffs: 12 },
    { x: -0.8, y: 3.8, z: -27.5, radius: 3.8, puffs: 15 },
    { x: 6.2, y: 4.6, z: -29.5, radius: 3.5, puffs: 13 },
    { x: 12.6, y: 4.1, z: -28.5, radius: 3.6, puffs: 14 },
    { x: -15.5, y: 9.2, z: -34, radius: 1.25, puffs: 5, vertical: 1.0, depth: 1.2 },
    { x: -8.0, y: 11.2, z: -35, radius: 0.9, puffs: 4, vertical: 0.8, depth: 1.0 },
    { x: 1.4, y: 10.6, z: -35.5, radius: 1.05, puffs: 5, vertical: 0.9, depth: 1.1 },
    { x: 10.2, y: 11.6, z: -34.5, radius: 1.15, puffs: 5, vertical: 0.9, depth: 1.2 },
    { x: 16.0, y: 9.5, z: -33.5, radius: 1.3, puffs: 5, vertical: 1.0, depth: 1.2 },
  ];

  const middleCenters: CloudCenter[] = [
    { x: -15.0, y: 1.4, z: -18.5, radius: 4.7, puffs: 17 },
    { x: -8.1, y: 2.0, z: -19.2, radius: 4.2, puffs: 16 },
    { x: -1.2, y: 1.1, z: -18.2, radius: 4.8, puffs: 18 },
    { x: 6.5, y: 1.8, z: -19.5, radius: 4.4, puffs: 17 },
    { x: 13.8, y: 1.5, z: -18.8, radius: 4.8, puffs: 18 },
  ];

  const frontCenters: CloudCenter[] = [
    { x: -17.2, y: -2.5, z: -8.5, radius: 6.8, puffs: 22, vertical: 5.2, depth: 4.8 },
    { x: -8.7, y: -2.2, z: -9.6, radius: 5.8, puffs: 20, vertical: 4.7, depth: 4.4 },
    { x: 0.2, y: -3.0, z: -8.8, radius: 6.4, puffs: 22, vertical: 5.0, depth: 4.8 },
    { x: 9.0, y: -2.1, z: -9.7, radius: 5.9, puffs: 20, vertical: 4.7, depth: 4.4 },
    { x: 17.5, y: -2.6, z: -8.7, radius: 6.7, puffs: 22, vertical: 5.2, depth: 4.8 },
  ];

  const back = addCloudLayer(THREE, scene, geometry, materials.back, backCenters, random, { speed: 0.022, sway: 0.34 });
  const middle = addCloudLayer(THREE, scene, geometry, materials.middle, middleCenters, random, { speed: 0.034, sway: 0.46 });
  const front = addCloudLayer(THREE, scene, geometry, materials.front, frontCenters, random, { speed: 0.045, sway: 0.26 });

  return { geometry, materials, back, middle, front };
}

function addStars(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const dimCount = 115;
  const dimPositions = new Float32Array(dimCount * 3);
  for (let index = 0; index < dimCount; index += 1) {
    dimPositions[index * 3] = (random() - 0.5) * 42;
    dimPositions[index * 3 + 1] = 5.5 + random() * 12.5;
    dimPositions[index * 3 + 2] = -31 - random() * 9;
  }
  const dimGeometry = new THREE.BufferGeometry();
  dimGeometry.setAttribute('position', new THREE.BufferAttribute(dimPositions, 3));
  const dimMaterial = new THREE.PointsMaterial({
    color: 0xf7f4ff,
    size: 0.07,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dimStars = new THREE.Points(dimGeometry, dimMaterial);
  scene.add(dimStars);

  const brightCount = 18;
  const brightPositions = new Float32Array(brightCount * 3);
  for (let index = 0; index < brightCount; index += 1) {
    brightPositions[index * 3] = (random() - 0.5) * 38;
    brightPositions[index * 3 + 1] = 7.0 + random() * 11.0;
    brightPositions[index * 3 + 2] = -30 - random() * 8;
  }
  const brightGeometry = new THREE.BufferGeometry();
  brightGeometry.setAttribute('position', new THREE.BufferAttribute(brightPositions, 3));
  const brightMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.14,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const brightStars = new THREE.Points(brightGeometry, brightMaterial);
  scene.add(brightStars);

  return { dimStars, dimMaterial, brightStars, brightMaterial };
}

function disposeScene(
  scene: InstanceType<ThreeModule['Scene']>,
  renderer: InstanceType<ThreeModule['WebGLRenderer']>,
  canvas: HTMLCanvasElement,
  resizeObserver: ResizeObserver,
  pointerHandler: (event: PointerEvent) => void,
) {
  renderer.setAnimationLoop(null);
  resizeObserver.disconnect();
  window.removeEventListener('pointermove', pointerHandler);
  scene.traverse(object => {
    const candidate = object as unknown as { geometry?: Disposable; material?: Disposable | Disposable[] };
    candidate.geometry?.dispose?.();
    if (Array.isArray(candidate.material)) candidate.material.forEach(material => material.dispose?.());
    else candidate.material?.dispose?.();
  });
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
}

export async function launchSoft3DExperience() {
  const host = findTodayHost();
  if (!host) throw new Error('Open the Today dashboard before launching Soft Cloudscape.');
  if (document.documentElement.dataset.theme !== 'soft') throw new Error('Soft Cloudscape only runs in the Soft theme.');
  if (activeDispose) return;

  const token = ++generation;
  const THREE = await import('three');
  if (token !== generation || document.documentElement.dataset.theme !== 'soft') return;

  const layer = document.createElement('div');
  layer.className = 'soft-3d-layer';
  layer.setAttribute('aria-hidden', 'true');
  host.prepend(layer);

  const canvas = document.createElement('canvas');
  canvas.className = 'soft-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  layer.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6e7498, 0.0125);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 110);
  camera.position.set(0, 2.8, 18.5);
  camera.lookAt(0, 2.4, -16.5);

  const ambient = new THREE.HemisphereLight(0xeef5ff, 0x55465d, 2.0);
  const warmKey = new THREE.DirectionalLight(0xffc3cf, 3.6);
  warmKey.position.set(11, 12, 7);
  const coolFill = new THREE.DirectionalLight(0xa6dcff, 2.8);
  coolFill.position.set(-12, 5, 4);
  const softBack = new THREE.PointLight(0xd9c6ff, 10, 32, 2);
  softBack.position.set(0, 10, -16);
  scene.add(ambient, warmKey, coolFill, softBack);

  const random = seededRandom(0x41d5a7c3);
  const stars = addStars(THREE, scene, random);
  const clouds = addCloudscape(THREE, scene, random);

  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const pointerHandler = (event: PointerEvent) => {
    target.x = (event.clientX / window.innerWidth - 0.5) * 2;
    target.y = (event.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', pointerHandler, { passive: true });

  const resize = () => {
    const rect = layer.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(layer);
  resize();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();

    pointer.x += (target.x - pointer.x) * 0.017;
    pointer.y += (target.y - pointer.y) * 0.017;
    const motion = reducedMotion ? 0 : 1;

    camera.position.x = pointer.x * 0.5 * motion;
    camera.position.y = 2.8 - pointer.y * 0.18 * motion;
    camera.lookAt(pointer.x * 0.13 * motion, 2.4 - pointer.y * 0.05 * motion, -16.5);

    if (!reducedMotion) {
      clouds.back.group.position.x = clouds.back.baseX + Math.sin(elapsed * clouds.back.speed) * clouds.back.sway;
      clouds.back.group.position.y = clouds.back.baseY + Math.sin(elapsed * 0.035) * 0.08;
      clouds.middle.group.position.x = clouds.middle.baseX + Math.sin(elapsed * clouds.middle.speed + 1.5) * clouds.middle.sway;
      clouds.middle.group.position.y = clouds.middle.baseY + Math.sin(elapsed * 0.045 + 0.8) * 0.11;
      clouds.front.group.position.x = clouds.front.baseX + Math.sin(elapsed * clouds.front.speed + 2.1) * clouds.front.sway;
      clouds.front.group.position.y = clouds.front.baseY + Math.sin(elapsed * 0.055 + 1.7) * 0.07;
      stars.dimStars.rotation.y = Math.sin(elapsed * 0.018) * 0.01;
      stars.brightMaterial.opacity = 0.78 + Math.sin(elapsed * 0.8) * 0.16;
      stars.dimMaterial.opacity = 0.64 + Math.sin(elapsed * 0.42 + 1.2) * 0.08;
    }

    renderer.render(scene, camera);
  });

  document.documentElement.dataset.soft3d = 'active';

  const themeObserver = new MutationObserver(() => {
    if (document.documentElement.dataset.theme === 'soft') return;
    activeDispose?.();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  activeDispose = () => {
    if (!activeDispose) return;
    generation += 1;
    themeObserver.disconnect();
    disposeScene(scene, renderer, canvas, resizeObserver, pointerHandler);
    layer.remove();
    activeDispose = null;
    delete document.documentElement.dataset.soft3d;
    delete document.documentElement.dataset.softPanelsHidden;
    window.dispatchEvent(new CustomEvent('family-os:soft-3d-stopped'));
  };
}
