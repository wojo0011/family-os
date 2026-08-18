type ThreeModule = typeof import('three');

type Disposable = { dispose?: () => void };

type DriftParticle = {
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  sway: number;
  scale: number;
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

function createMaterialSet(THREE: ThreeModule) {
  const porcelain = new THREE.MeshPhysicalMaterial({
    color: 0xf4e9ef,
    roughness: 0.22,
    metalness: 0.02,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
  });

  const champagne = new THREE.MeshPhysicalMaterial({
    color: 0xd9b789,
    roughness: 0.2,
    metalness: 0.64,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });

  const smokedGlass = new THREE.MeshPhysicalMaterial({
    color: 0xc9b7d8,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.62,
    thickness: 0.9,
    ior: 1.35,
    transparent: true,
    opacity: 0.72,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    depthWrite: false,
  });

  const blushGlass = new THREE.MeshPhysicalMaterial({
    color: 0xe6a9bd,
    roughness: 0.1,
    metalness: 0.02,
    transmission: 0.5,
    thickness: 0.7,
    ior: 1.3,
    transparent: true,
    opacity: 0.68,
    clearcoat: 1,
    clearcoatRoughness: 0.09,
    depthWrite: false,
  });

  const plum = new THREE.MeshPhysicalMaterial({
    color: 0x3f2d44,
    roughness: 0.42,
    metalness: 0.12,
    clearcoat: 0.46,
    clearcoatRoughness: 0.24,
  });

  const pearl = new THREE.MeshPhysicalMaterial({
    color: 0xffeff5,
    roughness: 0.12,
    metalness: 0.05,
    transmission: 0.14,
    thickness: 0.4,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.45,
    sheenColor: new THREE.Color(0xffb7cf),
    sheenRoughness: 0.28,
  });

  return { porcelain, champagne, smokedGlass, blushGlass, plum, pearl };
}

function addStage(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  materials: ReturnType<typeof createMaterialSet>,
) {
  const stage = new THREE.Group();
  stage.name = 'soft-atelier-stage';

  const base = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.1, 0.48, 72), materials.plum);
  base.position.set(0, -2.4, -12.5);
  base.receiveShadow = true;
  stage.add(base);

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(5.95, 6.15, 0.2, 72),
    materials.porcelain,
  );
  top.position.set(0, -2.08, -12.5);
  top.receiveShadow = true;
  stage.add(top);

  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(6.15, 0.055, 10, 128),
    materials.champagne,
  );
  trim.rotation.x = Math.PI / 2;
  trim.position.set(0, -1.96, -12.5);
  stage.add(trim);

  const inset = new THREE.Mesh(
    new THREE.CircleGeometry(4.15, 72),
    new THREE.MeshPhysicalMaterial({
      color: 0xeadde6,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.58,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  );
  inset.rotation.x = -Math.PI / 2;
  inset.position.set(0, -1.94, -12.5);
  stage.add(inset);

  scene.add(stage);
  return { stage, inset };
}

function makeArch(
  THREE: ThreeModule,
  material: InstanceType<ThreeModule['Material']>,
  x: number,
  z: number,
  width: number,
  height: number,
  depthOffset: number,
) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-width / 2, 0, 0),
    new THREE.Vector3(-width * 0.32, height * 0.78, -depthOffset),
    new THREE.Vector3(0, height, -depthOffset * 1.15),
    new THREE.Vector3(width * 0.32, height * 0.78, -depthOffset),
    new THREE.Vector3(width / 2, 0, 0),
  ]);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.095, 10, false), material);
  mesh.position.set(x, -1.95, z);
  mesh.castShadow = true;
  return mesh;
}

function addArchitecture(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  materials: ReturnType<typeof createMaterialSet>,
) {
  const group = new THREE.Group();
  group.name = 'soft-atelier-architecture';

  const rearArch = makeArch(THREE, materials.smokedGlass, 0, -17.2, 11.8, 8.4, 0.55);
  rearArch.rotation.y = 0.04;
  group.add(rearArch);

  const leftArch = makeArch(THREE, materials.blushGlass, -2.55, -13.4, 7.6, 6.6, 0.36);
  leftArch.rotation.y = -0.21;
  group.add(leftArch);

  const rightArch = makeArch(THREE, materials.smokedGlass, 2.75, -14.1, 7.8, 6.9, 0.42);
  rightArch.rotation.y = 0.23;
  group.add(rightArch);

  const columnGeometry = new THREE.CapsuleGeometry(0.32, 3.8, 8, 16);
  const columns = new THREE.InstancedMesh(columnGeometry, materials.porcelain, 9);
  const dummy = new THREE.Object3D();
  const placements = [
    [-7.6, 0.4, -18.2, 1.18],
    [-5.9, -0.15, -20.5, 0.88],
    [-4.7, 0.15, -16.9, 0.72],
    [7.7, 0.55, -18.8, 1.12],
    [6.1, -0.05, -21.1, 0.82],
    [4.9, 0.2, -17.1, 0.7],
    [-8.8, 1.1, -24.5, 1.3],
    [8.9, 1.0, -24.2, 1.24],
    [0, 2.4, -26.4, 0.92],
  ] as const;

  placements.forEach(([x, y, z, scale], index) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(scale, 1.2 + index * 0.025, scale);
    dummy.rotation.y = (index % 2 ? -1 : 1) * 0.04;
    dummy.updateMatrix();
    columns.setMatrixAt(index, dummy.matrix);
  });
  columns.instanceMatrix.needsUpdate = true;
  columns.castShadow = true;
  group.add(columns);

  scene.add(group);
  return { group, rearArch, leftArch, rightArch };
}

function addHeroSculpture(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  materials: ReturnType<typeof createMaterialSet>,
) {
  const group = new THREE.Group();
  group.name = 'soft-atelier-hero';
  group.position.set(0, 0.35, -12.4);

  const pearl = new THREE.Mesh(new THREE.SphereGeometry(1.25, 42, 30), materials.pearl);
  pearl.castShadow = true;
  group.add(pearl);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(2.15, 0.17, 116, 14, 2, 3),
    materials.champagne,
  );
  knot.rotation.set(0.56, -0.3, 0.2);
  knot.castShadow = true;
  group.add(knot);

  const haloMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe8d7f0,
    roughness: 0.08,
    metalness: 0.08,
    transmission: 0.42,
    transparent: true,
    opacity: 0.58,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    depthWrite: false,
  });

  const haloA = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.045, 8, 128), haloMaterial);
  haloA.rotation.set(1.18, 0.08, 0.18);
  group.add(haloA);

  const haloB = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.035, 8, 128), materials.blushGlass);
  haloB.rotation.set(0.22, 1.18, 0.5);
  group.add(haloB);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.22, 1.42, 0.46, 48),
    materials.porcelain,
  );
  pedestal.position.y = -2.06;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  const pedestalTrim = new THREE.Mesh(
    new THREE.TorusGeometry(1.28, 0.035, 8, 96),
    materials.champagne,
  );
  pedestalTrim.rotation.x = Math.PI / 2;
  pedestalTrim.position.y = -1.82;
  group.add(pedestalTrim);

  scene.add(group);
  return { group, pearl, knot, haloA, haloB };
}

function addAmbientObjects(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  materials: ReturnType<typeof createMaterialSet>,
) {
  const group = new THREE.Group();
  const placements = [
    [-5.2, 0.25, -10.3, 0.62, 0.86],
    [5.45, 0.8, -11.1, 0.76, 1.05],
    [-6.45, 2.4, -16.3, 0.42, 0.64],
    [6.65, 2.05, -17.1, 0.48, 0.72],
    [-3.55, 4.6, -20.5, 0.3, 0.48],
    [3.8, 4.35, -21.2, 0.34, 0.5],
  ] as const;

  const orbs: InstanceType<ThreeModule['Mesh']>[] = [];
  placements.forEach(([x, y, z, radius, scale], index) => {
    const material = index % 3 === 0 ? materials.pearl : index % 3 === 1 ? materials.blushGlass : materials.smokedGlass;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(radius, 26, 20), material);
    orb.position.set(x, y, z);
    orb.scale.set(1, scale, 1);
    orb.castShadow = index < 2;
    group.add(orb);
    orbs.push(orb);
  });

  scene.add(group);
  return { group, orbs };
}

function addDriftParticles(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const count = 28;
  const geometry = new THREE.PlaneGeometry(0.12, 0.18);
  geometry.rotateZ(Math.PI / 4);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf1ccd9,
    emissive: 0x5d2b42,
    emissiveIntensity: 0.08,
    roughness: 0.28,
    metalness: 0.06,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const states: DriftParticle[] = [];
  const dummy = new THREE.Object3D();

  for (let index = 0; index < count; index += 1) {
    const state: DriftParticle = {
      x: (random() - 0.5) * 24,
      y: -0.5 + random() * 11,
      z: -7 - random() * 21,
      phase: random() * Math.PI * 2,
      speed: 0.035 + random() * 0.045,
      sway: 0.28 + random() * 0.55,
      scale: 0.65 + random() * 0.7,
    };
    states.push(state);
    dummy.position.set(state.x, state.y, state.z);
    dummy.scale.setScalar(state.scale);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return { mesh, states, dummy };
}

function addSparkles(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const count = 110;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 34;
    positions[index * 3 + 1] = -0.5 + random() * 14;
    positions[index * 3 + 2] = -8 - random() * 28;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffeef5,
    size: 0.045,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { points, material };
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
  if (document.documentElement.dataset.theme !== 'soft') throw new Error('Soft 3D only runs in the Soft theme.');
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.3));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x251b27, 0.017);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(0, 3.9, 16.8);
  camera.lookAt(0, 0.65, -13.5);

  const materials = createMaterialSet(THREE);

  const ambient = new THREE.HemisphereLight(0xfff5f8, 0x1f1822, 1.55);
  const keyLight = new THREE.DirectionalLight(0xffe6d3, 3.2);
  keyLight.position.set(-8, 12, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -13;
  keyLight.shadow.camera.right = 13;
  keyLight.shadow.camera.top = 13;
  keyLight.shadow.camera.bottom = -10;

  const roseLight = new THREE.PointLight(0xef9dbb, 24, 26, 2);
  roseLight.position.set(-6.5, 5.5, -8.5);
  const violetLight = new THREE.PointLight(0xbca7db, 20, 28, 2);
  violetLight.position.set(6.8, 6.6, -13.5);
  const champagneLight = new THREE.PointLight(0xffd8aa, 18, 24, 2);
  champagneLight.position.set(0, -0.3, -7.5);
  scene.add(ambient, keyLight, roseLight, violetLight, champagneLight);

  const random = seededRandom(0x91c4e227);
  const stage = addStage(THREE, scene, materials);
  const architecture = addArchitecture(THREE, scene, materials);
  const hero = addHeroSculpture(THREE, scene, materials);
  const ambientObjects = addAmbientObjects(THREE, scene, materials);
  const drift = addDriftParticles(THREE, scene, random);
  const sparkles = addSparkles(THREE, scene, random);

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

    pointer.x += (target.x - pointer.x) * 0.018;
    pointer.y += (target.y - pointer.y) * 0.018;
    const parallax = reducedMotion ? 0 : 1;
    camera.position.x = pointer.x * 0.48 * parallax;
    camera.position.y = 3.9 - pointer.y * 0.18 * parallax;
    camera.lookAt(pointer.x * 0.12 * parallax, 0.65 - pointer.y * 0.04 * parallax, -13.5);

    if (!reducedMotion) {
      hero.group.position.y = 0.35 + Math.sin(elapsed * 0.32) * 0.08;
      hero.group.rotation.y = Math.sin(elapsed * 0.11) * 0.07;
      hero.knot.rotation.y = elapsed * 0.075;
      hero.knot.rotation.z = 0.2 + Math.sin(elapsed * 0.16) * 0.05;
      hero.haloA.rotation.z = 0.18 + elapsed * 0.035;
      hero.haloB.rotation.x = 0.22 + Math.sin(elapsed * 0.14) * 0.08;
      hero.pearl.rotation.y = elapsed * 0.03;

      architecture.group.rotation.y = Math.sin(elapsed * 0.07) * 0.008;
      architecture.rearArch.position.y = Math.sin(elapsed * 0.11) * 0.025;
      architecture.leftArch.position.y = Math.sin(elapsed * 0.13 + 0.7) * 0.03;
      architecture.rightArch.position.y = Math.sin(elapsed * 0.12 + 1.4) * 0.03;

      ambientObjects.orbs.forEach((orb, index) => {
        orb.position.y += Math.sin(elapsed * (0.22 + index * 0.012) + index) * 0.0015;
        orb.rotation.y = elapsed * (0.015 + index * 0.002);
      });

      drift.states.forEach((state, index) => {
        const fall = (elapsed * state.speed + state.phase) % 1;
        const y = 10.4 - fall * 13.5;
        const x = state.x + Math.sin(elapsed * 0.22 + state.phase) * state.sway;
        const z = state.z + Math.cos(elapsed * 0.15 + state.phase) * 0.42;
        drift.dummy.position.set(x, y, z);
        drift.dummy.rotation.set(elapsed * 0.16 + state.phase, elapsed * 0.11 + index, Math.sin(elapsed * 0.3 + state.phase));
        drift.dummy.scale.setScalar(state.scale);
        drift.dummy.updateMatrix();
        drift.mesh.setMatrixAt(index, drift.dummy.matrix);
      });
      drift.mesh.instanceMatrix.needsUpdate = true;

      sparkles.points.rotation.y = elapsed * 0.003;
      sparkles.material.opacity = 0.42 + Math.sin(elapsed * 0.5) * 0.08;
      stage.inset.rotation.z = elapsed * 0.012;

      const orbit = elapsed * 0.18;
      roseLight.position.x = -6.5 + Math.sin(orbit) * 0.8;
      violetLight.position.x = 6.8 + Math.cos(orbit * 0.86) * 0.7;
      champagneLight.intensity = 17 + Math.sin(elapsed * 0.28) * 1.1;
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
