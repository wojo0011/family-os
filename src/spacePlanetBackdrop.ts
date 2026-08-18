type PlanetElement = HTMLElement & { style: CSSStyleDeclaration };

let installed = false;
let layer: HTMLElement | null = null;
let frameId = 0;
let attempts = 0;

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

function makeLayer(className: string) {
  const element = document.createElement('span');
  element.className = className;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function makeEarth() {
  const earth = document.createElement('div') as PlanetElement;
  earth.className = 'space-texture-planet space-texture-earth';
  earth.setAttribute('aria-hidden', 'true');
  earth.style.setProperty('--planet-surface', `url("${asset('earthmap1k.jpg')}")`);
  earth.style.setProperty('--planet-bump', `url("${asset('earthbump1k.jpg')}")`);
  earth.style.setProperty('--planet-spec', `url("${asset('earthspec1k.jpg')}")`);
  earth.style.setProperty('--planet-clouds', `url("${asset('earthcloudmap.jpg')}")`);
  earth.style.setProperty('--planet-cloud-mask', `url("${asset('earthcloudmaptrans.jpg')}")`);
  earth.append(
    makeLayer('space-planet-surface'),
    makeLayer('space-planet-detail'),
    makeLayer('space-planet-spec'),
    makeLayer('space-planet-clouds'),
    makeLayer('space-planet-lighting'),
  );
  return earth;
}

function makeMars() {
  const mars = document.createElement('div') as PlanetElement;
  mars.className = 'space-texture-planet space-texture-mars';
  mars.setAttribute('aria-hidden', 'true');
  mars.style.setProperty('--planet-surface', `url("${asset('5672_mars_2k_color.jpg')}")`);
  mars.style.setProperty('--planet-bump', `url("${asset('5672_marsbump2k.jpg')}")`);
  mars.style.setProperty('--planet-normal', `url("${asset('5672_mars_2k_normal.jpg')}")`);
  mars.append(
    makeLayer('space-planet-surface'),
    makeLayer('space-planet-detail'),
    makeLayer('space-planet-normal'),
    makeLayer('space-planet-lighting'),
  );
  return mars;
}

function mount() {
  if (layer?.isConnected) return true;
  const sceneLayer = document.querySelector<HTMLElement>('.space-experience-layer');
  if (!sceneLayer) return false;

  layer = document.createElement('div');
  layer.className = 'space-texture-planets';
  layer.setAttribute('aria-hidden', 'true');
  layer.append(makeEarth(), makeMars());
  sceneLayer.appendChild(layer);
  document.documentElement.dataset.spacePlanets = 'textured';
  return true;
}

function waitForScene() {
  if (mount()) return;
  attempts += 1;
  if (attempts > 180) return;
  frameId = requestAnimationFrame(waitForScene);
}

export function installSpacePlanetBackdrop() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  attempts = 0;
  cancelAnimationFrame(frameId);
  waitForScene();
}
