type ThreeModule = typeof import('three');
type PlanetVariant = 'standard' | 'kids';

type PlanetGroup = {
  group: InstanceType<ThreeModule['Group']>;
  surface: InstanceType<ThreeModule['Mesh']>;
  clouds?: InstanceType<ThreeModule['Mesh']>;
};

let installed = false;
let activeLayer: HTMLElement | null = null;
let activeVariant: PlanetVariant | null = null;
let disposePlanets: (() => void) | null = null;
let syncQueued = false;
let generation = 0;
let panelsHidden = false;
let panelToggle: HTMLButtonElement | null = null;

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function getVariant(): PlanetVariant {
  const activeLens = document.querySelector<HTMLButtonElement>('.lens-picker.compact button.active');
  const label = activeLens?.querySelector('b')?.textContent?.trim().toLowerCase() ?? '';
  return label === 'child' || label === 'kid' || label === 'kids' ? 'kids' : 'standard';
}

function setColorTexture(THREE: ThreeModule, texture: InstanceType<ThreeModule['Texture']>) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addAtmosphere(
  THREE: ThreeModule,
  group: InstanceType<ThreeModule['Group']>,
  radius: number,
  color: number,
  strength: number,
) {
  const geometry = new THREE.SphereGeometry(radius * 1.075, 52, 40);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      strength: { value: strength },
    },
    vertexShader: `
      varying float vIntensity;
      void main() {
        vec3 viewNormal = normalize(normalMatrix * normal);
        vec3 viewPosition = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
        vIntensity = pow(1.0 - max(dot(viewNormal, viewPosition), 0.0), 2.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float strength;
      varying float vIntensity;
      void main() {
        gl_FragColor = vec4(glowColor, vIntensity * strength);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(geometry, material);
  group.add(atmosphere);
}

function buildEarth(
  THREE: ThreeModule,
  loader: InstanceType<ThreeModule['TextureLoader']>,
  variant: PlanetVariant,
  textures: InstanceType<ThreeModule['Texture']>[],
): PlanetGroup {
  const group = new THREE.Group();
  group.name = `family-os-earth-${variant}`;
  const geometry = new THREE.SphereGeometry(1.58, 64, 48);

  let material: InstanceType<ThreeModule['Material']>;
  if (variant === 'kids') {
    const map = setColorTexture(THREE, loader.load(asset('earth_surface_2k.jpg')));
    textures.push(map);
    material = new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0.02 });
  } else {
    const map = setColorTexture(THREE, loader.load(asset('earthmap1k.jpg')));
    const bumpMap = loader.load(asset('earthbump1k.jpg'));
    const specularMap = loader.load(asset('earthspec1k.jpg'));
    textures.push(map, bumpMap, specularMap);
    material = new THREE.MeshPhongMaterial({
      map,
      bumpMap,
      bumpScale: 0.065,
      specularMap,
      specular: new THREE.Color(0x6d8fac),
      shininess: 18,
    });
  }

  const surface = new THREE.Mesh(geometry, material);
  surface.rotation.z = -0.19;
  group.add(surface);

  let clouds: InstanceType<ThreeModule['Mesh']> | undefined;
  if (variant === 'standard') {
    const cloudMap = setColorTexture(THREE, loader.load(asset('earthcloudmap.jpg')));
    const alphaMap = loader.load(asset('earthcloudmaptrans.jpg'));
    textures.push(cloudMap, alphaMap);
    const cloudMaterial = new THREE.MeshPhongMaterial({
      map: cloudMap,
      alphaMap,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    clouds = new THREE.Mesh(new THREE.SphereGeometry(1.61, 64, 48), cloudMaterial);
    clouds.rotation.z = -0.19;
    group.add(clouds);
  }

  addAtmosphere(THREE, group, 1.58, variant === 'kids' ? 0x70d7ff : 0x4d9dff, variant === 'kids' ? 0.52 : 0.42);
  return { group, surface, clouds };
}

function buildMars(
  THREE: ThreeModule,
  loader: InstanceType<ThreeModule['TextureLoader']>,
  variant: PlanetVariant,
  textures: InstanceType<ThreeModule['Texture']>[],
): PlanetGroup {
  const group = new THREE.Group();
  group.name = `family-os-mars-${variant}`;
  const geometry = new THREE.SphereGeometry(1.08, 60, 44);

  let material: InstanceType<ThreeModule['Material']>;
  if (variant === 'kids') {
    const map = setColorTexture(THREE, loader.load(asset('mars_surface_2k.jpg')));
    textures.push(map);
    material = new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0.01 });
  } else {
    const map = setColorTexture(THREE, loader.load(asset('5672_mars_2k_color.jpg')));
    const bumpMap = loader.load(asset('5672_marsbump2k.jpg'));
    const normalMap = loader.load(asset('5672_mars_2k_normal.jpg'));
    textures.push(map, bumpMap, normalMap);
    material = new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.055,
      normalMap,
      normalScale: new THREE.Vector2(0.72, 0.72),
      roughness: 0.96,
      metalness: 0,
    });
  }

  const surface = new THREE.Mesh(geometry, material);
  surface.rotation.z = 0.11;
  group.add(surface);
  addAtmosphere(THREE, group, 1.08, variant === 'kids' ? 0xff9b73 : 0xd66d42, variant === 'kids' ? 0.38 : 0.24);
  return { group, surface };
}

function ensurePanelToggle(host: HTMLElement | null) {
  if (!host || document.documentElement.dataset.theme !== 'space') {
    panelToggle?.remove();
    panelToggle = null;
    panelsHidden = false;
    delete document.documentElement.dataset.spacePanelsHidden;
    return;
  }

  if (!panelToggle?.isConnected) {
    panelToggle = document.createElement('button');
    panelToggle.type = 'button';
    panelToggle.className = 'space-panel-toggle';
    panelToggle.addEventListener('click', () => {
      panelsHidden = !panelsHidden;
      document.documentElement.dataset.spacePanelsHidden = String(panelsHidden);
      if (panelToggle) {
        panelToggle.textContent = panelsHidden ? '▣ Show panels' : '◫ Hide panels';
        panelToggle.setAttribute('aria-pressed', String(panelsHidden));
      }
    });
    document.body.appendChild(panelToggle);
  }

  document.documentElement.dataset.spacePanelsHidden = String(panelsHidden);
  panelToggle.textContent = panelsHidden ? '▣ Show panels' : '◫ Hide panels';
  panelToggle.setAttribute('aria-pressed', String(panelsHidden));
}

function destroyPlanetScene() {
  generation += 1;
  disposePlanets?.();
  disposePlanets = null;
  activeLayer = null;
  activeVariant = null;
}

async function mountPlanetScene(layer: HTMLElement, variant: PlanetVariant, token: number) {
  const THREE = await import('three');
  if (token !== generation || !layer.isConnected) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'space-planet-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  layer.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 40);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x7788aa, variant === 'kids' ? 1.35 : 0.85));
  const keyLight = new THREE.DirectionalLight(0xfff0d8, variant === 'kids' ? 3.5 : 2.8);
  keyLight.position.set(-6, 6, 9);
  scene.add(keyLight);
  const earthRim = new THREE.PointLight(0x70cfff, 8, 18, 2);
  earthRim.position.set(7, 3.5, 4);
  scene.add(earthRim);
  const marsRim = new THREE.PointLight(0xff8a62, 5, 16, 2);
  marsRim.position.set(1, 3, 4);
  scene.add(marsRim);

  const loader = new THREE.TextureLoader();
  const textures: InstanceType<ThreeModule['Texture']>[] = [];
  const earth = buildEarth(THREE, loader, variant, textures);
  const mars = buildMars(THREE, loader, variant, textures);
  scene.add(earth.group, mars.group);

  const positionPlanets = (width: number, height: number) => {
    const aspect = width / Math.max(1, height);
    const halfWidth = aspect * 5;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = 5;
    camera.bottom = -5;
    camera.updateProjectionMatrix();

    // These positions intentionally cover the old placeholder planet locations
    // while keeping both worlds behind the Family OS panels.
    earth.group.position.set(Math.min(halfWidth - 1.25, halfWidth * 0.68), 2.55, 0);
    mars.group.position.set(Math.min(halfWidth - 3.0, halfWidth * 0.18), 3.05, -0.2);
    const smallViewport = width < 980;
    earth.group.scale.setScalar(smallViewport ? 0.78 : 1);
    mars.group.scale.setScalar(smallViewport ? 0.76 : 1);
  };

  const resize = () => {
    const rect = layer.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    positionPlanets(width, height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(layer);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();
    earth.surface.rotation.y = elapsed * 0.035;
    if (earth.clouds) earth.clouds.rotation.y = elapsed * 0.052;
    mars.surface.rotation.y = elapsed * 0.021;
    earth.group.rotation.z = Math.sin(elapsed * 0.08) * 0.008;
    mars.group.rotation.z = Math.sin(elapsed * 0.07 + 1.3) * 0.007;
    renderer.render(scene, camera);
  });

  disposePlanets = () => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    scene.traverse(object => {
      const candidate = object as unknown as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
      candidate.geometry?.dispose?.();
      if (Array.isArray(candidate.material)) candidate.material.forEach(material => material.dispose?.());
      else candidate.material?.dispose?.();
    });
    textures.forEach(texture => texture.dispose());
    renderer.dispose();
    canvas.remove();
  };
}

function sync() {
  const host = findTodayHost();
  ensurePanelToggle(host);

  const layer = document.querySelector<HTMLElement>('.space-experience-three');
  if (!host || !layer || document.documentElement.dataset.theme !== 'space') {
    if (activeLayer) destroyPlanetScene();
    return;
  }

  const variant = getVariant();
  if (activeLayer === layer && activeVariant === variant && layer.querySelector('.space-planet-canvas')) return;

  destroyPlanetScene();
  activeLayer = layer;
  activeVariant = variant;
  const token = generation;
  void mountPlanetScene(layer, variant, token);
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    sync();
  });
}

export function installSpacePlanetExperience() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const observer = new MutationObserver(() => queueSync());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-space-active'],
    childList: true,
    subtree: true,
  });

  window.addEventListener('resize', queueSync, { passive: true });
  queueSync();
}
