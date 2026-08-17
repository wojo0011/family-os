type SpaceRendererPreference = 'auto' | 'image' | 'three';
type SpaceQuality = 'low' | 'balanced' | 'high';
type RoverSpeed = 'calm' | 'normal' | 'fast';

type ThreeModule = typeof import('three');
type ThreeMaterial = InstanceType<ThreeModule['Material']>;
type ThreeGroup = InstanceType<ThreeModule['Group']>;
type ThreeScene = InstanceType<ThreeModule['Scene']>;
type ThreeMesh = InstanceType<ThreeModule['Mesh']>;

type NavigatorCapabilities = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

type RoverModel = {
  group: ThreeGroup;
  wheels: ThreeGroup[];
  beaconMaterial: InstanceType<ThreeModule['MeshStandardMaterial']>;
  headlightMaterials: InstanceType<ThreeModule['MeshStandardMaterial']>[];
  wheelRadius: number;
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

function addCylinderBetween(
  THREE: ThreeModule,
  parent: ThreeGroup,
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  material: ThreeMaterial,
  radialSegments = 10,
) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

function addWheel(
  THREE: ThreeModule,
  parent: ThreeGroup,
  x: number,
  z: number,
  tireMaterial: ThreeMaterial,
  hubMaterial: ThreeMaterial,
  treadMaterial: ThreeMaterial,
) {
  const wheel = new THREE.Group();
  wheel.position.set(x, -0.3, z);

  // CylinderGeometry is Y-axis aligned by default. Rotate the geometry itself so
  // the axle is local Z. The wheel group can then roll cleanly around local Z.
  const tireGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 24, 1, false);
  tireGeometry.rotateX(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeometry, tireMaterial);
  wheel.add(tire);

  const hubGeometry = new THREE.CylinderGeometry(0.19, 0.19, 0.32, 18);
  hubGeometry.rotateX(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeometry, hubMaterial);
  wheel.add(hub);

  const capGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.35, 12);
  capGeometry.rotateX(Math.PI / 2);
  const cap = new THREE.Mesh(capGeometry, treadMaterial);
  wheel.add(cap);

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.34), treadMaterial);
    tread.position.set(Math.cos(angle) * 0.38, Math.sin(angle) * 0.38, 0);
    tread.rotation.z = angle;
    wheel.add(tread);
  }

  parent.add(wheel);
  return wheel;
}

function addAstronaut(
  THREE: ThreeModule,
  rover: ThreeGroup,
  suitMaterial: ThreeMaterial,
  jointMaterial: ThreeMaterial,
  visorMaterial: ThreeMaterial,
  darkMaterial: ThreeMaterial,
) {
  const astronaut = new THREE.Group();
  astronaut.name = 'family-os-astronaut';
  astronaut.position.set(-0.05, 0.03, 0);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.52, 8, 16), suitMaterial);
  torso.position.set(0.08, 1.31, 0);
  torso.rotation.z = -0.07;
  astronaut.add(torso);

  const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.34), darkMaterial);
  chestPanel.position.set(-0.18, 1.33, 0);
  astronaut.add(chestPanel);

  const chestLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.08, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x71dcff, emissive: 0x2087b2, emissiveIntensity: 1.4 }),
  );
  chestLight.position.set(-0.22, 1.37, 0);
  astronaut.add(chestLight);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.5), suitMaterial);
  backpack.position.set(0.33, 1.32, 0);
  astronaut.add(backpack);

  for (const z of [-0.16, 0.16]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.47, 12), jointMaterial);
    tank.position.set(0.53, 1.34, z);
    astronaut.add(tank);
  }

  const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.035, 10, 26), jointMaterial);
  neckRing.rotation.x = Math.PI / 2;
  neckRing.position.set(-0.02, 1.68, 0);
  astronaut.add(neckRing);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 30, 22), suitMaterial);
  helmet.position.set(-0.06, 1.93, 0);
  astronaut.add(helmet);

  // The astronaut faces the rover's travel direction (-X), so the visor is
  // offset toward the front rather than toward the camera.
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.276, 30, 22), visorMaterial);
  visor.scale.set(0.72, 0.78, 0.94);
  visor.position.set(-0.245, 1.93, 0);
  astronaut.add(visor);

  const helmetLampMaterial = new THREE.MeshStandardMaterial({ color: 0xf6fbff, emissive: 0x9ddcff, emissiveIntensity: 2.2 });
  const helmetLamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), helmetLampMaterial);
  helmetLamp.position.set(-0.08, 2.2, 0.26);
  astronaut.add(helmetLamp);

  // Arms: shoulders -> elbows -> gloves on the steering controls.
  const armPairs: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
    [[-0.05, 1.5, -0.25], [-0.34, 1.22, -0.29], [-0.62, 1.03, -0.25]],
    [[-0.05, 1.5, 0.25], [-0.34, 1.22, 0.29], [-0.62, 1.03, 0.25]],
  ];
  for (const [shoulder, elbow, hand] of armPairs) {
    addCylinderBetween(THREE, astronaut, shoulder, elbow, 0.09, suitMaterial, 12);
    addCylinderBetween(THREE, astronaut, elbow, hand, 0.082, suitMaterial, 12);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), jointMaterial);
    glove.position.set(...hand);
    astronaut.add(glove);
  }

  // Seated legs: hips -> knees -> foot rest, with visible suit joint rings.
  const legPairs: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
    [[0.06, 1.08, -0.18], [-0.32, 0.72, -0.23], [-0.76, 0.5, -0.25]],
    [[0.06, 1.08, 0.18], [-0.32, 0.72, 0.23], [-0.76, 0.5, 0.25]],
  ];
  for (const [hip, knee, foot] of legPairs) {
    addCylinderBetween(THREE, astronaut, hip, knee, 0.12, suitMaterial, 12);
    const kneeRing = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), jointMaterial);
    kneeRing.position.set(...knee);
    astronaut.add(kneeRing);
    addCylinderBetween(THREE, astronaut, knee, foot, 0.105, suitMaterial, 12);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.22), darkMaterial);
    boot.position.set(foot[0] - 0.08, foot[1] - 0.03, foot[2]);
    boot.rotation.z = -0.12;
    astronaut.add(boot);
  }

  // A cool fill attached to the driver keeps the white suit and visor readable
  // against the darker rover without lighting the whole lunar landscape.
  const astronautFill = new THREE.PointLight(0xb9ddff, 3.1, 3.4, 2);
  astronautFill.position.set(-0.16, 1.72, 0.72);
  astronaut.add(astronautFill);

  rover.add(astronaut);
}

function addRover(THREE: ThreeModule, scene: ThreeScene): RoverModel {
  const group = new THREE.Group();
  group.name = 'family-os-rover';

  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xdde4ef, roughness: 0.45, metalness: 0.28 });
  const shellDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x8995aa, roughness: 0.56, metalness: 0.42 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x344054, roughness: 0.65, metalness: 0.56 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x171d28, roughness: 0.95, metalness: 0.04 });
  const treadMaterial = new THREE.MeshStandardMaterial({ color: 0x293244, roughness: 0.9, metalness: 0.1 });
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa6b9, roughness: 0.38, metalness: 0.7 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0x4e719f, roughness: 0.12, metalness: 0.32, transparent: true, opacity: 0.82 });
  const suitMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.03, emissive: 0x11182a, emissiveIntensity: 0.18 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0xc7d2e2, roughness: 0.46, metalness: 0.2 });
  const visorMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd58a3c, roughness: 0.09, metalness: 0.78, clearcoat: 1, clearcoatRoughness: 0.1 });

  const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.18, 0.82), frameMaterial);
  lowerFrame.position.y = -0.02;
  group.add(lowerFrame);

  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.48, 1.08), shellMaterial);
  mainBody.position.set(0.02, 0.34, 0);
  group.add(mainBody);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.2, 0.76), shellDarkMaterial);
  belly.position.set(0.05, 0.02, 0);
  group.add(belly);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.23, 1.18), frameMaterial);
  frontBumper.position.set(-1.48, 0.12, 0);
  group.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 1.02), frameMaterial);
  rearBumper.position.set(1.47, 0.08, 0);
  group.add(rearBumper);

  // Driver platform and controls.
  const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.65), frameMaterial);
  seatBase.position.set(0.18, 0.72, 0);
  group.add(seatBase);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.68), frameMaterial);
  seatBack.position.set(0.45, 0.98, 0);
  seatBack.rotation.z = -0.12;
  group.add(seatBack);

  const console = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.62), shellDarkMaterial);
  console.position.set(-0.57, 0.84, 0);
  console.rotation.z = -0.24;
  group.add(console);
  const display = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.31, 0.42), glassMaterial);
  display.position.set(-0.69, 0.91, 0);
  display.rotation.z = -0.24;
  group.add(display);

  addCylinderBetween(THREE, group, [-0.65, 1.0, -0.28], [-0.65, 1.0, 0.28], 0.035, frameMaterial, 10);

  // Rear cargo / battery module.
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.92), shellDarkMaterial);
  cargo.position.set(0.98, 0.72, 0);
  group.add(cargo);
  for (const z of [-0.3, 0.3]) {
    const battery = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.18), frameMaterial);
    battery.position.set(1.0, 0.68, z);
    group.add(battery);
  }

  // Roll / grab rail around the cockpit.
  for (const z of [-0.48, 0.48]) {
    addCylinderBetween(THREE, group, [-0.18, 0.62, z], [-0.1, 1.56, z], 0.035, shellDarkMaterial, 10);
    addCylinderBetween(THREE, group, [-0.1, 1.56, z], [0.62, 1.5, z], 0.035, shellDarkMaterial, 10);
  }

  const wheels: ThreeGroup[] = [];
  for (const x of [-0.98, 0.98]) {
    for (const z of [-0.7, 0.7]) {
      // Suspension wishbone and axle stub.
      addCylinderBetween(THREE, group, [x * 0.76, 0.02, z * 0.58], [x, -0.28, z], 0.045, frameMaterial, 8);
      addCylinderBetween(THREE, group, [x * 0.74, 0.17, z * 0.58], [x, -0.28, z], 0.035, frameMaterial, 8);
      wheels.push(addWheel(THREE, group, x, z, tireMaterial, hubMaterial, treadMaterial));
    }
  }

  // Front lamps make the travel direction obvious.
  const headlightMaterials: InstanceType<ThreeModule['MeshStandardMaterial']>[] = [];
  for (const z of [-0.33, 0.33]) {
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xeefbff, emissive: 0x8fdcff, emissiveIntensity: 2.4 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.2), lightMaterial);
    lamp.position.set(-1.585, 0.35, z);
    group.add(lamp);
    headlightMaterials.push(lightMaterial);
  }

  // Antenna mast and beacon.
  addCylinderBetween(THREE, group, [1.05, 0.92, 0.35], [1.38, 1.76, 0.35], 0.028, shellDarkMaterial, 10);
  const antennaDish = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.04, 0.07, 20), shellMaterial);
  antennaDish.rotation.z = Math.PI / 2;
  antennaDish.position.set(1.42, 1.82, 0.35);
  group.add(antennaDish);
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0x71dcff, emissive: 0x2898c4, emissiveIntensity: 1.8 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), beaconMaterial);
  beacon.position.set(1.42, 1.98, 0.35);
  group.add(beacon);

  addAstronaut(THREE, group, suitMaterial, jointMaterial, visorMaterial, frameMaterial);

  const modelScale = 0.88;
  group.scale.setScalar(modelScale);
  group.position.set(16, -3.02, -3.15);

  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = quality !== 'low';
      object.receiveShadow = quality !== 'low';
    }
  });

  scene.add(group);
  return {
    group,
    wheels,
    beaconMaterial,
    headlightMaterials,
    wheelRadius: 0.38 * modelScale,
  };
}

async function createThreeLayer(host: HTMLElement, layer: HTMLElement, token: number) {
  const THREE = await import('three');
  if (token !== generation || !layer.isConnected) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'space-experience-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  layer.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08091a, 0.022);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
  camera.position.set(0, 0.8, 11.8);
  // Aim the optical centre above the dashboard content so the moon surface and
  // rover project into the lower viewport band rather than behind Night Sky.
  camera.lookAt(0, 0.35, -3.8);

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
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const ambient = new THREE.HemisphereLight(0xaabaff, 0x111528, 1.4);
  const sun = new THREE.DirectionalLight(0xffe2c4, 3.3);
  sun.position.set(-8, 10, 7);
  sun.castShadow = quality !== 'low';
  if (sun.castShadow) {
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
  }
  const rim = new THREE.PointLight(0x6fdcff, 20, 20, 2);
  rim.position.set(7, 2.5, -1.5);
  scene.add(ambient, sun, rim);

  const starCount = quality === 'high' ? 2300 : quality === 'balanced' ? 1400 : 720;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 18 + Math.random() * 58;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.cos(phi);
    starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 20;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xe9eeff, size: quality === 'high' ? 0.077 : 0.062, transparent: true, opacity: 0.9 }),
  );
  scene.add(stars);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, quality === 'low' ? 26 : 52, quality === 'low' ? 20 : 40),
    new THREE.MeshStandardMaterial({ color: 0x735fda, roughness: 0.7, metalness: 0.08, emissive: 0x1c123d, emissiveIntensity: 0.62 }),
  );
  planet.position.set(7.5, 4.2, -10.2);
  scene.add(planet);

  const ringed = new THREE.Group();
  const ringPlanet = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 36, 28),
    new THREE.MeshStandardMaterial({ color: 0xc98572, roughness: 0.64 }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.06, 12, 96),
    new THREE.MeshStandardMaterial({ color: 0xf1c79a, transparent: true, opacity: 0.72 }),
  );
  ring.rotation.x = 1.12;
  ring.rotation.y = -0.22;
  ringed.add(ringPlanet, ring);
  ringed.position.set(2.5, 4.6, -8.1);
  scene.add(ringed);

  const GROUND_Y = -3.6;
  const ROAD_WORLD_Z = -3.15;
  const ROAD_LOCAL_Y = -ROAD_WORLD_Z;
  const craterFields = [
    { x: -7.3, y: 3.6, r: 1.65, d: 0.36 },
    { x: -2.2, y: 5.8, r: 1.05, d: 0.28 },
    { x: 2.8, y: 2.0, r: 1.35, d: 0.32 },
    { x: 7.2, y: 5.0, r: 1.85, d: 0.42 },
    { x: 11.5, y: 1.1, r: 0.9, d: 0.2 },
  ];

  const terrainHeight = (x: number, localY: number) => {
    let height = Math.sin(x * 0.38) * 0.055 + Math.cos(localY * 0.82 + x * 0.13) * 0.045;
    height += Math.sin(x * 1.37 + localY * 0.57) * 0.018;
    for (const crater of craterFields) {
      const dx = x - crater.x;
      const dy = localY - crater.y;
      const distance = Math.hypot(dx, dy);
      const depression = -crater.d * Math.exp(-(distance * distance) / (crater.r * crater.r * 0.42));
      const rimDistance = distance - crater.r * 0.82;
      const rim = crater.d * 0.34 * Math.exp(-(rimDistance * rimDistance) / (crater.r * crater.r * 0.055));
      height += depression + rim;
    }
    return height;
  };

  const groundGeometry = new THREE.PlaneGeometry(
    42,
    15,
    quality === 'high' ? 110 : quality === 'balanced' ? 72 : 46,
    quality === 'high' ? 45 : quality === 'balanced' ? 30 : 18,
  );
  const positions = groundGeometry.attributes.position;
  const terrainColors = new Float32Array(positions.count * 3);
  const lowColor = new THREE.Color(0x515a6d);
  const highColor = new THREE.Color(0x9aa4b8);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const localY = positions.getY(i);
    const detail = quality === 'low' ? 0 : (Math.sin(x * 4.7 + localY * 3.1) + Math.cos(x * 2.2 - localY * 4.4)) * 0.008;
    const height = terrainHeight(x, localY) + detail;
    positions.setZ(i, height);
    const mix = Math.max(0, Math.min(1, 0.4 + height * 1.6 + (Math.sin(x * 1.9 + localY) + 1) * 0.035));
    const color = lowColor.clone().lerp(highColor, mix);
    terrainColors[i * 3] = color.r;
    terrainColors[i * 3 + 1] = color.g;
    terrainColors[i * 3 + 2] = color.b;
  }
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  groundGeometry.computeVertexNormals();
  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0.02 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, GROUND_Y, -6.0);
  ground.receiveShadow = quality !== 'low';
  scene.add(ground);

  // Crater rims and scattered rocks add readable silhouettes at the bottom of the viewport.
  const craterMaterial = new THREE.MeshStandardMaterial({ color: 0x555f73, roughness: 1 });
  for (const craterField of craterFields) {
    const worldZ = -craterField.y - 6.0;
    const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(craterField.r * 0.84, 0.055, 8, 42), craterMaterial);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(craterField.x, GROUND_Y + terrainHeight(craterField.x, craterField.y) + 0.035, worldZ);
    rimMesh.receiveShadow = quality !== 'low';
    scene.add(rimMesh);
  }

  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x697387, roughness: 1 });
  const rockCount = quality === 'high' ? 42 : quality === 'balanced' ? 28 : 16;
  for (let i = 0; i < rockCount; i += 1) {
    const x = -18 + Math.random() * 36;
    const localY = 0.4 + Math.random() * 13.6;
    const worldZ = -localY - 6.0;
    const size = 0.06 + Math.random() * 0.18;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMaterial);
    rock.scale.set(1 + Math.random() * 0.7, 0.7 + Math.random() * 0.55, 0.8 + Math.random() * 0.6);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.position.set(x, GROUND_Y + terrainHeight(x, localY) + size * 0.55, worldZ);
    rock.castShadow = quality !== 'low';
    rock.receiveShadow = quality !== 'low';
    scene.add(rock);
  }

  const rover = addRover(THREE, scene);

  // Dust motes trail behind the rover while it is actively driving.
  const dustCount = quality === 'high' ? 42 : quality === 'balanced' ? 28 : 16;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ color: 0xc6cbd4, size: quality === 'high' ? 0.075 : 0.06, transparent: true, opacity: 0.25, depthWrite: false });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.visible = false;
  scene.add(dust);

  const clock = new THREE.Clock();
  const pointer = { x: 0, y: 0 };
  const targetPointer = { x: 0, y: 0 };

  const onPointerMove = (event: PointerEvent) => {
    targetPointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    targetPointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

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

  const linearSpeed = roverSpeed === 'calm' ? 0.82 : roverSpeed === 'fast' ? 1.58 : 1.15;
  const START_X = 16.5;
  const END_X = -16.5;
  const MIN_WAIT = roverSpeed === 'fast' ? 4 : roverSpeed === 'calm' ? 10 : 7;
  const MAX_WAIT = roverSpeed === 'fast' ? 12 : roverSpeed === 'calm' ? 25 : 19;
  const randomWait = () => MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
  let roverState: 'waiting' | 'driving' = 'waiting';
  let waitRemaining = 1.5 + Math.random() * 3.5;
  let previousElapsed = 0;
  let wheelAngle = 0;
  rover.group.position.x = START_X;
  rover.group.visible = false;

  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(0.05, Math.max(0, elapsed - previousElapsed));
    previousElapsed = elapsed;

    pointer.x += (targetPointer.x - pointer.x) * 0.025;
    pointer.y += (targetPointer.y - pointer.y) * 0.025;
    camera.position.x = pointer.x * 0.34;
    camera.position.y = 0.8 - pointer.y * 0.14;
    camera.lookAt(pointer.x * 0.14, 0.35 - pointer.y * 0.05, -3.8);

    stars.rotation.y = elapsed * 0.0035;
    stars.rotation.x = Math.sin(elapsed * 0.08) * 0.015;
    planet.rotation.y = elapsed * 0.035;
    ringed.rotation.y = Math.sin(elapsed * 0.15) * 0.08;
    ringed.position.y = 4.6 + Math.sin(elapsed * 0.22) * 0.12;

    if (roverState === 'waiting') {
      waitRemaining -= delta;
      rover.group.visible = false;
      dust.visible = false;
      if (waitRemaining <= 0) {
        roverState = 'driving';
        rover.group.position.x = START_X;
        rover.group.visible = true;
      }
    } else {
      const distance = linearSpeed * delta;
      rover.group.position.x -= distance;
      const localY = ROAD_LOCAL_Y - 6.0;
      const terrainLocalY = -rover.group.position.z - 6.0;
      const surface = GROUND_Y + terrainHeight(rover.group.position.x, terrainLocalY);
      const ahead = terrainHeight(rover.group.position.x - 0.7, terrainLocalY);
      const behind = terrainHeight(rover.group.position.x + 0.7, terrainLocalY);
      const slope = Math.atan2(ahead - behind, 1.4);
      rover.group.position.y = surface + 0.58 + Math.sin(elapsed * 7.5) * 0.006;
      rover.group.rotation.z += (slope - rover.group.rotation.z) * 0.12;

      wheelAngle -= distance / rover.wheelRadius;
      rover.wheels.forEach(wheel => {
        wheel.rotation.z = wheelAngle;
      });

      rover.beaconMaterial.emissiveIntensity = 1.15 + Math.max(0, Math.sin(elapsed * 4.2)) * 2.25;
      const lampPulse = 2.25 + Math.sin(elapsed * 1.8) * 0.18;
      rover.headlightMaterials.forEach(material => { material.emissiveIntensity = lampPulse; });

      dust.visible = quality !== 'low';
      if (dust.visible) {
        const attr = dustGeometry.attributes.position;
        for (let i = 0; i < dustCount; i += 1) {
          const phase = (elapsed * 0.62 + i / dustCount) % 1;
          const spread = ((i * 37) % 11) / 11 - 0.5;
          attr.setXYZ(
            i,
            rover.group.position.x + 1.25 + phase * 1.8,
            surface + 0.1 + Math.sin(phase * Math.PI) * 0.22,
            ROAD_WORLD_Z + spread * (0.55 + phase * 0.7),
          );
        }
        attr.needsUpdate = true;
      }

      if (rover.group.position.x <= END_X) {
        roverState = 'waiting';
        rover.group.visible = false;
        dust.visible = false;
        rover.group.position.x = START_X;
        waitRemaining = randomWait();
      }
    }

    renderer.render(scene, camera);
  });

  disposeThree = () => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    scene.traverse(object => {
      const candidate = object as unknown as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
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