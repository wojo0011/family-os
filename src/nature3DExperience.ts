type ThreeModule = typeof import('three');

type Disposable = { dispose?: () => void };

type Butterfly = {
  group: InstanceType<ThreeModule['Group']>;
  leftWing: InstanceType<ThreeModule['Mesh']>;
  rightWing: InstanceType<ThreeModule['Mesh']>;
  radius: number;
  speed: number;
  phase: number;
  height: number;
};

let activeDispose: (() => void) | null = null;
let generation = 0;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function seededRandom(seed = 0x72a4b91d) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function terrainHeight(x: number, z: number) {
  const broad = Math.sin(x * 0.15) * 0.42 + Math.cos(z * 0.18) * 0.34;
  const detail = Math.sin(x * 0.42 + z * 0.21) * 0.11;
  const clearing = Math.exp(-((x * x) / 95 + ((z + 4) * (z + 4)) / 72));
  return -2.35 + broad + detail - clearing * 0.34;
}

function addTerrain(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const geometry = new THREE.PlaneGeometry(54, 42, 72, 58);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const dark = new THREE.Color(0x17341f);
  const mid = new THREE.Color(0x2f5f37);
  const light = new THREE.Color(0x5a7c43);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const y = terrainHeight(x, z);
    positions.setY(index, y);
    const mix = Math.max(0, Math.min(1, (y + 3.0) / 1.65));
    const color = dark.clone().lerp(mid, mix).lerp(light, Math.max(0, mix - 0.58) * 0.72);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  scene.add(terrain);
  return terrain;
}

function addForest(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const treeCount = 86;
  const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.17, 1, 7);
  const crownGeometry = new THREE.ConeGeometry(0.82, 2.25, 9);
  const crownGeometry2 = new THREE.SphereGeometry(0.72, 10, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5d3f2a, roughness: 1 });
  const evergreenMaterial = new THREE.MeshStandardMaterial({ color: 0x173f28, roughness: 0.94 });
  const leafyMaterial = new THREE.MeshStandardMaterial({ color: 0x376d3b, roughness: 0.94 });

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
  const evergreens = new THREE.InstancedMesh(crownGeometry, evergreenMaterial, treeCount);
  const leafy = new THREE.InstancedMesh(crownGeometry2, leafyMaterial, treeCount);
  const dummy = new THREE.Object3D();
  let evergreenCount = 0;
  let leafyCount = 0;

  for (let index = 0; index < treeCount; index += 1) {
    let x = (random() - 0.5) * 46;
    let z = -4 - random() * 30;
    const distanceFromCenter = Math.hypot(x * 0.8, z + 8);
    if (distanceFromCenter < 8.5) {
      x += x < 0 ? -8.5 : 8.5;
      z -= 2 + random() * 3;
    }

    const y = terrainHeight(x, z);
    const height = 2.2 + random() * 4.6;
    const width = 0.78 + random() * 0.7;
    const isEvergreen = random() > 0.34;

    dummy.position.set(x, y + height * 0.5, z);
    dummy.scale.set(0.9 + random() * 0.45, height, 0.9 + random() * 0.45);
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);

    dummy.position.set(x, y + height + (isEvergreen ? 0.66 : 0.42), z);
    dummy.scale.set(width, isEvergreen ? 1.05 + random() * 0.58 : 0.95 + random() * 0.38, width);
    dummy.rotation.y = random() * Math.PI;
    dummy.updateMatrix();
    if (isEvergreen) evergreens.setMatrixAt(evergreenCount++, dummy.matrix);
    else leafy.setMatrixAt(leafyCount++, dummy.matrix);
  }

  trunks.instanceMatrix.needsUpdate = true;
  evergreens.count = evergreenCount;
  evergreens.instanceMatrix.needsUpdate = true;
  leafy.count = leafyCount;
  leafy.instanceMatrix.needsUpdate = true;
  trunks.castShadow = trunks.receiveShadow = true;
  evergreens.castShadow = true;
  leafy.castShadow = true;
  scene.add(trunks, evergreens, leafy);

  return { trunks, evergreens, leafy };
}

function addStream(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const points = [
    new THREE.Vector3(-10.5, 0, -28),
    new THREE.Vector3(-6.5, 0, -20),
    new THREE.Vector3(-2.2, 0, -14),
    new THREE.Vector3(2.4, 0, -9),
    new THREE.Vector3(5.8, 0, -4),
    new THREE.Vector3(9.5, 0, 2),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 96, 0.82, 8, false);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x4fa7a0,
    emissive: 0x0b3f45,
    emissiveIntensity: 0.28,
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.72,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
  });
  const stream = new THREE.Mesh(geometry, material);
  stream.rotation.x = Math.PI / 2;
  stream.position.y = -1.78;
  scene.add(stream);
  return { stream, material };
}

function addRocksAndFlowers(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x667263, roughness: 1 });
  const flowerMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xffd86e }),
    new THREE.MeshBasicMaterial({ color: 0xf5a5d8 }),
    new THREE.MeshBasicMaterial({ color: 0xb9d8ff }),
  ];

  for (let index = 0; index < 24; index += 1) {
    const x = (random() - 0.5) * 22;
    const z = 1 - random() * 18;
    const size = 0.08 + random() * 0.22;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMaterial);
    rock.position.set(x, terrainHeight(x, z) + size * 0.55, z);
    rock.scale.set(1 + random() * 0.8, 0.55 + random() * 0.55, 0.8 + random() * 0.45);
    rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    scene.add(rock);
  }

  const flowerGeometry = new THREE.SphereGeometry(0.055, 7, 5);
  for (let index = 0; index < 90; index += 1) {
    const x = (random() - 0.5) * 24;
    const z = 3 - random() * 16;
    if (Math.hypot(x - 4.5, z + 5) < 2.3) continue;
    const flower = new THREE.Mesh(flowerGeometry, flowerMaterials[index % flowerMaterials.length]);
    flower.position.set(x, terrainHeight(x, z) + 0.16 + random() * 0.14, z);
    scene.add(flower);
  }
}

function addFireflies(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const count = 76;
  const positions = new Float32Array(count * 3);
  const base: Array<[number, number, number, number]> = [];
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * 28;
    const z = 2 - random() * 22;
    const y = terrainHeight(x, z) + 0.7 + random() * 4.1;
    const phase = random() * Math.PI * 2;
    base.push([x, y, z, phase]);
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffef8a,
    size: 0.095,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { points, geometry, base };
}

function addButterflies(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
) {
  const butterflies: Butterfly[] = [];
  const colors = [0xf6c85f, 0xf0a6ca, 0x8fc9ff, 0xe9b872];

  for (let index = 0; index < 7; index += 1) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: colors[index % colors.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const wingGeometry = new THREE.PlaneGeometry(0.18, 0.12);
    const leftWing = new THREE.Mesh(wingGeometry, material);
    const rightWing = new THREE.Mesh(wingGeometry, material);
    leftWing.position.x = -0.09;
    rightWing.position.x = 0.09;
    leftWing.rotation.y = -0.4;
    rightWing.rotation.y = 0.4;
    group.add(leftWing, rightWing);
    scene.add(group);

    butterflies.push({
      group,
      leftWing,
      rightWing,
      radius: 2.7 + random() * 5.6,
      speed: 0.18 + random() * 0.14,
      phase: random() * Math.PI * 2,
      height: 0.8 + random() * 2.5,
    });
  }

  return butterflies;
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

export async function launchNature3DExperience() {
  const host = findTodayHost();
  if (!host) throw new Error('Open the Today dashboard before launching Nature 3D.');
  if (activeDispose) return;

  const token = ++generation;
  const THREE = await import('three');
  if (token !== generation) return;

  const layer = document.createElement('div');
  layer.className = 'nature-3d-layer';
  layer.setAttribute('aria-hidden', 'true');
  host.prepend(layer);

  const canvas = document.createElement('canvas');
  canvas.className = 'nature-3d-canvas';
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb9d3b1, 0.021);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 120);
  camera.position.set(0, 4.5, 14.8);
  camera.lookAt(0, 0.2, -10.5);

  const skyLight = new THREE.HemisphereLight(0xdff5d4, 0x19341d, 1.6);
  const sun = new THREE.DirectionalLight(0xffefd0, 3.2);
  sun.position.set(-9, 13, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -12;
  const streamGlow = new THREE.PointLight(0x7fd7cc, 4.2, 18, 2);
  streamGlow.position.set(5, 0, -5);
  scene.add(skyLight, sun, streamGlow);

  const random = seededRandom(0x38f19a72);
  addTerrain(THREE, scene);
  const forest = addForest(THREE, scene, random);
  const stream = addStream(THREE, scene);
  addRocksAndFlowers(THREE, scene, random);
  const fireflies = addFireflies(THREE, scene, random);
  const butterflies = addButterflies(THREE, scene, random);

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

    pointer.x += (target.x - pointer.x) * 0.022;
    pointer.y += (target.y - pointer.y) * 0.022;
    camera.position.x = pointer.x * 0.7;
    camera.position.y = 4.5 - pointer.y * 0.28;
    camera.lookAt(pointer.x * 0.2, 0.2 - pointer.y * 0.08, -10.5);

    forest.evergreens.rotation.z = Math.sin(elapsed * 0.36) * 0.0035;
    forest.leafy.rotation.z = Math.sin(elapsed * 0.42 + 0.8) * 0.0048;
    stream.material.opacity = 0.69 + Math.sin(elapsed * 0.65) * 0.035;
    stream.material.emissiveIntensity = 0.26 + Math.sin(elapsed * 0.48) * 0.04;

    const fireflyAttr = fireflies.geometry.attributes.position;
    fireflies.base.forEach(([x, y, z, phase], index) => {
      fireflyAttr.setXYZ(
        index,
        x + Math.sin(elapsed * 0.35 + phase) * 0.24,
        y + Math.sin(elapsed * 0.72 + phase) * 0.22,
        z + Math.cos(elapsed * 0.31 + phase) * 0.2,
      );
    });
    fireflyAttr.needsUpdate = true;

    butterflies.forEach((butterfly, index) => {
      const angle = elapsed * butterfly.speed + butterfly.phase;
      const x = Math.cos(angle) * butterfly.radius + Math.sin(angle * 0.47 + index) * 1.2;
      const z = -7 + Math.sin(angle) * butterfly.radius * 0.66;
      const y = terrainHeight(x, z) + butterfly.height + Math.sin(elapsed * 1.2 + index) * 0.18;
      butterfly.group.position.set(x, y, z);
      butterfly.group.rotation.y = -angle + Math.PI / 2;
      const flap = 0.28 + Math.sin(elapsed * 7.5 + butterfly.phase) * 0.58;
      butterfly.leftWing.rotation.y = -flap;
      butterfly.rightWing.rotation.y = flap;
    });

    renderer.render(scene, camera);
  });

  document.documentElement.dataset.nature3d = 'active';

  const themeObserver = new MutationObserver(() => {
    if (document.documentElement.dataset.theme === 'nature') return;
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
    delete document.documentElement.dataset.nature3d;
    delete document.documentElement.dataset.naturePanelsHidden;
    window.dispatchEvent(new CustomEvent('family-os:nature-3d-stopped'));
  };
}
