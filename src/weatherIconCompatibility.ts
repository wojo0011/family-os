const METEOCONS_LEGACY_BASE = 'https://cdn.meteocons.com/0.1.0/';
const METEOCONS_CURRENT_BASE = 'https://cdn.meteocons.com/latest/';

export function normalizeWeatherIconUrl(value: string) {
  if (!value.includes('cdn.meteocons.com/')) return value;

  return value
    .replace(METEOCONS_LEGACY_BASE, METEOCONS_CURRENT_BASE)
    .replace('/overcast-day.svg', '/overcast.svg')
    .replace('/thunderstorms-day.svg', '/thunderstorms-day-rain.svg');
}

export function installWeatherIconCompatibility() {
  if (typeof window === 'undefined' || typeof HTMLImageElement === 'undefined') return;

  const marker = '__familyOsMeteoconsCompatibilityInstalled';
  const markedWindow = window as Window & Record<string, unknown>;
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  const imagePrototype = HTMLImageElement.prototype;
  const srcDescriptor = Object.getOwnPropertyDescriptor(imagePrototype, 'src');

  if (srcDescriptor?.get && srcDescriptor.set && srcDescriptor.configurable) {
    Object.defineProperty(imagePrototype, 'src', {
      ...srcDescriptor,
      set(this: HTMLImageElement, value: string) {
        srcDescriptor.set?.call(this, normalizeWeatherIconUrl(String(value)));
      },
    });
  }

  const originalSetAttribute = imagePrototype.setAttribute;
  imagePrototype.setAttribute = function setAttribute(this: HTMLImageElement, name: string, value: string) {
    const nextValue = name.toLowerCase() === 'src' ? normalizeWeatherIconUrl(value) : value;
    return originalSetAttribute.call(this, name, nextValue);
  };
}
