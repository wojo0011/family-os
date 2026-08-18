type ThreeModule = typeof import('three');

type Disposable = { dispose?: () => void };

type FloatingOrb = {
  mesh: InstanceType<ThreeModule['Mesh']>;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  speed: number;
  drift: number;
};

type PetalState = {
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  sway: number;
};

let activeDispose: (() => void) | null = null;
let generation = 0;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function seededRandom(seed = 0x67e09a31) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addClouds(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const geometry = new THREE.SphereGeometry(1, 14, 10);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xfff7fb,
    roughness: 0.78,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const count = 42;
  const clouds = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();

  for (let index = 0; index < count; index += 1) {
    const band = index % 7;
    const x = -19 + band * 6.2 + (random() - 0.5) * 3.6;
    const y = 5.4 + random() * 6.2;
    const z = -11 - random() * 26;
    const size = 0.7 + random() * 1.55;
    dummy.position.set(x, y, z);
    dummy.scale.set(size * (1.2 + random() * 0.9), size * (0.52 + random() * 0.45), size);
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    clouds.setMatrixAt(index, dummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  scene.add(clouds);
  return clouds;
}

function addRibbons(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const materials = [
    new THREE.MeshPhysicalMaterial({ color: 0xff9fc8, emissive: 0x5b1838, emissiveIntensity: 0.18, roughness: 0.34, metalness: 0.03, transparent: true, opacity: 0.46, side: THREE.DoubleSide }),
    new THREE.MeshPhysicalMaterial({ color: 0xcdb3ff, emissive: 0x34225a, emissiveIntensity: 0.18, roughness: 0.34, metalness: 0.03, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
    new THREE.MeshPhysicalMaterial({ color: 0xffd9ae, emissive: 0x5c3c22, emissiveIntensity: 0.12, roughness: 0.38, metalness: 0.02, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
  ];

  const ribbons: InstanceType<ThreeModule['Mesh']>[] = [];
  const curves = [
    [new THREE.Vector3(-15, -1.7, -17), new THREE.Vector3(-7, 4.6, -21), new THREE.Vector3(1, 1.1, -17), new THREE.Vector3(10, 5.6, -23), new THREE.Vector3(17, 0.6, -20)],
    [new THREE.Vector3(-14, 1.3, -28), new THREE.Vector3(-5, 7.3, -31), new THREE.Vector3(4, 3.7, -26), new THREE.Vector3(13, 8.1, -30)],
    [new THREE.Vector3(-17, -0.3, -10), new THREE.Vector3(-9, 3.7, -14), new THREE.Vector3(0, 0.2, -11), new THREE.Vector3(9, 3.1, -15), new THREE.Vector3(16, 1.0, -13)],
  ];

  curves.forEach((points, index) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 92, 0.08 + index * 0.018, 7, false);
    const ribbon = new THREE.Mesh(geometry, materials[index]);
    ribbon.rotation.z = index === 1 ? -0.04 : 0.03;
    scene.add(ribbon);
    ribbons.push(ribbon);
  });

  return ribbons;
}

function addOrbs(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const palette = [0xff9fc8, 0xcdb3ff, 0x9fdcff, 0xffd9ae];
  const orbs: FloatingOrb[] = [];

  for (let index = 0; index < 14; index += 1) {
    const material = new THREE.MeshPhysicalMaterial({
      color: palette[index % palette.length],
      emissive: palette[index % palette.length],
      emissiveIntensity: 0.08,
      roughness: 0.12,
      metalness: 0.02,
      transmission: 0.32,
      transparent: true,
      opacity: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const radius = 0.28 + random() * 0.8;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 22, 16), material);
    const baseX = (random() - 0.5) * 28;
    const baseY = -0.2 + random() * 9.6;
    const baseZ = -6 - random() * 25;
    mesh.position.set(baseX, baseY, baseZ);
    scene.add(mesh);
    orbs.push({
      mesh,
      baseX,
      baseY,
      baseZ,
      phase: random() * Math.PI * 2,
      speed: 0.18 + random() * 0.22,
      drift: 0.22 + random() * 0.65,
    });
  }

  return orbs;
}

function addPetals(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const count = 64;
  const geometry = new THREE.PlaneGeometry(0.13, 0.2);
  geometry.rotateZ(Math.PI / 4);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffbdd7,
    transparent: true,
    opacity: 0.74,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const petals = new THREE.InstancedMesh(geometry, material, count);
  const states: PetalState[] = [];
  const dummy = new THREE.Object3D();

  for (let index = 0; index < count; index += 1) {
    const state: PetalState = {
      x: (random() - 0.5) * 32,
      y: -1 + random() * 13,
      z: -4 - random() * 28,
      phase: random() * Math.PI * 2,
      speed: 0.08 + random() * 0.12,
      sway: 0.4 + random() * 0.9,
    };
    states.push(state);
    dummy.position.set(state.x, state.y, state.z);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const scale = 0.65 + random() * 0.9;
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    petals.setMatrixAt(index, dummy.matrix);
  }
  petals.instanceMatrix.needsUpdate = true;
  scene.add(petals);
  return { petals, states, dummy };
}

function addGlowFloor(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x402d47,
    emissive: 0x27152e,
    emissiveIntensity: 0.28,
    roughness: 0.48,
    metalness: 0.08,
    transparent: true,
    opacity: 0.4,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -2.5, -12);
  scene.add(floor);
  return floor;
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
  if (!host) throw new Error('Open the Today dashboard before launching Soft 3D.');
  if (activeDispose) return;

  const token = ++generation;
  const THREE = await import('three');
  if (token !== generation) return;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x24172b, 0.018);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 120);
  camera.position.set(0, 3.1, 15.2);
  camera.lookAt(0, 1.8, -13.5);

  const ambient = new THREE.HemisphereLight(0xffe6f2, 0x20142a, 1.45);
  const pinkLight = new THREE.PointLight(0xff8fbd, 13, 32, 2);
  pinkLight.position.set(-8, 8, -5);
  const violetLight = new THREE.PointLight(0xbda3ff, 11, 30, 2);
  violetLight.position.set(9, 6, -10);
  const warmLight = new THREE.DirectionalLight(0xffe0b5, 1.25);
  warmLight.position.set(-5, 10, 7);
  scene.add(ambient, pinkLight, violetLight, warmLight);

  const random = seededRandom(0x91c4e227);
  const clouds = addClouds(THREE, scene, random);
  const ribbons = addRibbons(THREE, scene);
  const orbs = addOrbs(THREE, scene, random);
  const petals = addPetals(THREE, scene, random);
  const floor = addGlowFloor(THREE, scene);

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

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();

    pointer.x += (target.x - pointer.x) * 0.02;
    pointer.y += (target.y - pointer.y) * 0.02;
    camera.position.x = pointer.x * 0.62;
    camera.position.y = 3.1 - pointer.y * 0.24;
    camera.lookAt(pointer.x * 0.2, 1.8 - pointer.y * 0.08, -13.5);

    clouds.rotation.y = Math.sin(elapsed * 0.08) * 0.018;
    clouds.position.x = Math.sin(elapsed * 0.055) * 0.7;
    ribbons.forEach((ribbon, index) => {
      ribbon.rotation.z = Math.sin(elapsed * (0.13 + index * 0.025) + index) * 0.025;
      ribbon.position.y = Math.sin(elapsed * (0.18 + index * 0.03) + index) * 0.16;
    });

    orbs.forEach((orb, index) => {
      orb.mesh.position.x = orb.baseX + Math.sin(elapsed * orb.speed + orb.phase) * orb.drift;
      orb.mesh.position.y = orb.baseY + Math.cos(elapsed * (orb.speed * 0.82) + orb.phase) * (orb.drift * 0.72);
      orb.mesh.position.z = orb.baseZ + Math.sin(elapsed * 0.11 + index) * 0.28;
      orb.mesh.rotation.y = elapsed * (0.04 + index * 0.002);
    });

    petals.states.forEach((state, index) => {
      const fall = (elapsed * state.speed + state.phase) % 1;
      const y = 11.8 - fall * 15;
      const x = state.x + Math.sin(elapsed * 0.42 + state.phase) * state.sway;
      const z = state.z + Math.cos(elapsed * 0.25 + state.phase) * 0.65;
      petals.dummy.position.set(x, y, z);
      petals.dummy.rotation.set(elapsed * 0.45 + state.phase, elapsed * 0.3 + index, Math.sin(elapsed + state.phase));
      petals.dummy.scale.setScalar(0.8 + (index % 5) * 0.08);
      petals.dummy.updateMatrix();
      petals.petals.setMatrixAt(index, petals.dummy.matrix);
    });
    petals.petals.instanceMatrix.needsUpdate = true;

    floor.rotation.z = elapsed * 0.015;
    pinkLight.intensity = 12.5 + Math.sin(elapsed * 0.32) * 1.2;
    violetLight.intensity = 10.5 + Math.cos(elapsed * 0.27) * 1.0;

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
