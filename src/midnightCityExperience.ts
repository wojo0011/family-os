type ThreeModule = typeof import('three');

type Disposable = { dispose?: () => void };

let activeDispose: (() => void) | null = null;
let generation = 0;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function seededRandom(seed = 0x5f3759df) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createWindowTexture(THREE: ThreeModule, seed: number, cool = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create Midnight city window texture.');

  const random = seededRandom(seed);
  ctx.fillStyle = '#07101b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 8; y < canvas.height - 6; y += 14) {
    for (let x = 7; x < canvas.width - 6; x += 13) {
      const on = random() > 0.39;
      if (!on) continue;
      const brightness = 0.58 + random() * 0.42;
      ctx.globalAlpha = brightness;
      ctx.fillStyle = cool
        ? (random() > 0.35 ? '#9ddcff' : '#e7f5ff')
        : (random() > 0.32 ? '#ffd88a' : '#fff0bd');
      ctx.fillRect(x, y, 5, 7);
    }
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function addStars(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>, random: () => number) {
  const count = 520;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 76;
    positions[index * 3 + 1] = 8 + random() * 27;
    positions[index * 3 + 2] = -8 - random() * 46;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xeaf3ff,
    size: 0.075,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
  return stars;
}

function addMoon(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xe8efff });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24), moonMaterial);
  moon.position.set(-10.5, 11.5, -27);
  scene.add(moon);

  const halo = new THREE.PointLight(0x9ec8ff, 16, 34, 2);
  halo.position.copy(moon.position).add(new THREE.Vector3(0, 0, 3));
  scene.add(halo);
  return moon;
}

function addCity(
  THREE: ThreeModule,
  scene: InstanceType<ThreeModule['Scene']>,
  random: () => number,
  materials: InstanceType<ThreeModule['MeshStandardMaterial']>[],
) {
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  buildingGeometry.translate(0, 0.5, 0);

  const buckets = materials.map(material => new THREE.InstancedMesh(buildingGeometry, material, 32));
  buckets.forEach(bucket => {
    bucket.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    scene.add(bucket);
  });
  const counts = buckets.map(() => 0);
  const dummy = new THREE.Object3D();

  const skyline: Array<{ x: number; z: number; width: number; depth: number; height: number }> = [];
  const rows = [
    { z: -8, count: 13, height: [2.2, 5.3] },
    { z: -13.5, count: 15, height: [3.6, 8.6] },
    { z: -20, count: 17, height: [5.4, 12.4] },
  ];

  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < row.count; index += 1) {
      const span = 34;
      const baseX = -span / 2 + (index / Math.max(1, row.count - 1)) * span;
      const width = 1.15 + random() * 1.65;
      const depth = 1.25 + random() * 1.9;
      let height = row.height[0] + random() * (row.height[1] - row.height[0]);
      const x = baseX + (random() - 0.5) * 1.45;
      const z = row.z + (random() - 0.5) * 2.1;

      if ((rowIndex === 2 && index === 5) || (rowIndex === 1 && index === 10)) height *= 1.42;

      const bucketIndex = Math.floor(random() * buckets.length) % buckets.length;
      const instanceIndex = counts[bucketIndex]++;
      dummy.position.set(x, -3.2, z);
      dummy.scale.set(width, height, depth);
      dummy.rotation.y = (random() - 0.5) * 0.035;
      dummy.updateMatrix();
      buckets[bucketIndex].setMatrixAt(instanceIndex, dummy.matrix);
      skyline.push({ x, z, width, depth, height });
    }
  });

  buckets.forEach((bucket, index) => {
    bucket.count = counts[index];
    bucket.instanceMatrix.needsUpdate = true;
  });

  // Rooftop antennas on a few of the tallest towers.
  skyline
    .slice()
    .sort((a, b) => b.height - a.height)
    .slice(0, 6)
    .forEach((tower, index) => {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, 1.3 + index * 0.12, 8),
        new THREE.MeshStandardMaterial({
          color: 0x48556c,
          emissive: index % 2 ? 0xff2d55 : 0x2f9cff,
          emissiveIntensity: 0.5,
        }),
      );
      mast.position.set(tower.x, -3.2 + tower.height + 0.65, tower.z);
      scene.add(mast);
    });

  return buckets;
}

function addRoadLights(THREE: ThreeModule, scene: InstanceType<ThreeModule['Scene']>) {
  const group = new THREE.Group();
  group.name = 'midnight-city-traffic';
  const materialA = new THREE.MeshBasicMaterial({ color: 0xffd36a });
  const materialB = new THREE.MeshBasicMaterial({ color: 0xff5f72 });
  const lights: Array<{ mesh: InstanceType<ThreeModule['Mesh']>; speed: number; lane: number }> = [];

  for (let index = 0; index < 16; index += 1) {
    const material = index % 3 === 0 ? materialB : materialA;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), material);
    const lane = index % 2 === 0 ? -0.65 : 0.65;
    mesh.position.set(-17 + (index / 16) * 34, -2.93, -4.6 + lane);
    mesh.scale.set(1.9, 0.7, 0.7);
    group.add(mesh);
    lights.push({ mesh, speed: 1.2 + (index % 5) * 0.13, lane });
  }
  scene.add(group);
  return lights;
}

function disposeScene(
  scene: InstanceType<ThreeModule['Scene']>,
  renderer: InstanceType<ThreeModule['WebGLRenderer']>,
  canvas: HTMLCanvasElement,
  observer: ResizeObserver,
  pointerHandler: (event: PointerEvent) => void,
) {
  renderer.setAnimationLoop(null);
  observer.disconnect();
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

export async function launchMidnightCityExperience() {
  const host = findTodayHost();
  if (!host) throw new Error('Open the Today dashboard before launching Midnight City.');
  if (activeDispose) return;

  const token = ++generation;
  const THREE = await import('three');
  if (token !== generation) return;

  const layer = document.createElement('div');
  layer.className = 'midnight-city-layer';
  layer.setAttribute('aria-hidden', 'true');
  host.prepend(layer);

  const canvas = document.createElement('canvas');
  canvas.className = 'midnight-city-canvas';
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07101b, 0.028);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(0, 4.7, 16.8);
  camera.lookAt(0, 2.6, -11.5);

  const ambient = new THREE.HemisphereLight(0x6688bb, 0x030609, 0.82);
  const moonLight = new THREE.DirectionalLight(0xaecfff, 1.55);
  moonLight.position.set(-10, 15, 8);
  const cityGlow = new THREE.PointLight(0xffbc68, 11, 32, 2);
  cityGlow.position.set(1, 2, -10);
  scene.add(ambient, moonLight, cityGlow);

  const random = seededRandom(0x1a2b3c4d);
  const stars = addStars(THREE, scene, random);
  const moon = addMoon(THREE, scene);

  const textures = [
    createWindowTexture(THREE, 81, false),
    createWindowTexture(THREE, 211, false),
    createWindowTexture(THREE, 377, true),
  ];
  const buildingMaterials = textures.map((texture, index) => new THREE.MeshStandardMaterial({
    color: index === 2 ? 0x14243a : index === 1 ? 0x101a2b : 0x0b1524,
    map: texture,
    emissiveMap: texture,
    emissive: index === 2 ? 0x4b8bb8 : 0xa96c24,
    emissiveIntensity: index === 2 ? 0.48 : 0.62,
    roughness: 0.86,
    metalness: 0.08,
  }));

  addCity(THREE, scene, random, buildingMaterials);
  const traffic = addRoadLights(THREE, scene);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 8),
    new THREE.MeshStandardMaterial({ color: 0x050a10, roughness: 0.72, metalness: 0.22 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -3.02, -5.2);
  scene.add(road);

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
    camera.position.x = pointer.x * 0.72;
    camera.position.y = 4.7 - pointer.y * 0.25;
    camera.lookAt(pointer.x * 0.25, 2.6 - pointer.y * 0.08, -11.5);

    stars.rotation.y = elapsed * 0.0018;
    moon.position.y = 11.5 + Math.sin(elapsed * 0.08) * 0.08;

    traffic.forEach((light, index) => {
      const direction = light.lane < 0 ? 1 : -1;
      light.mesh.position.x += direction * light.speed * 0.018;
      if (direction > 0 && light.mesh.position.x > 18) light.mesh.position.x = -18 - index * 0.25;
      if (direction < 0 && light.mesh.position.x < -18) light.mesh.position.x = 18 + index * 0.25;
    });

    renderer.render(scene, camera);
  });

  document.documentElement.dataset.midnightCity = 'active';

  const themeObserver = new MutationObserver(() => {
    if (document.documentElement.dataset.theme === 'midnight') return;
    activeDispose?.();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  activeDispose = () => {
    if (!activeDispose) return;
    generation += 1;
    themeObserver.disconnect();
    disposeScene(scene, renderer, canvas, resizeObserver, pointerHandler);
    textures.forEach(texture => texture.dispose());
    layer.remove();
    activeDispose = null;
    delete document.documentElement.dataset.midnightCity;
    delete document.documentElement.dataset.midnightPanelsHidden;
    window.dispatchEvent(new CustomEvent('family-os:midnight-city-stopped'));
  };
}
