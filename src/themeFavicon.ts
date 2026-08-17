type ThemeName = 'midnight' | 'space' | 'nature' | 'soft';

type ThemePalette = {
  start: string;
  end: string;
};

const THEME_PALETTES: Record<ThemeName, ThemePalette> = {
  midnight: { start: '#6bbcff', end: '#8ee7c5' },
  space: { start: '#a494ff', end: '#71dcff' },
  nature: { start: '#65d99a', end: '#dec66e' },
  soft: { start: '#ff9fc8', end: '#cdb3ff' },
};

let installed = false;

function currentTheme(): ThemeName {
  const value = document.documentElement.dataset.theme as ThemeName | undefined;
  return value && value in THEME_PALETTES ? value : 'space';
}

function faviconSvg(theme: ThemeName) {
  const palette = THEME_PALETTES[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="g" x1="8" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="${palette.start}"/>
        <stop offset="1" stop-color="${palette.end}"/>
      </linearGradient>
      <radialGradient id="shine" cx="0" cy="0" r="1" gradientTransform="translate(18 13) rotate(45) scale(42)">
        <stop stop-color="#fff" stop-opacity=".34"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#g)"/>
    <rect x="3" y="3" width="58" height="58" rx="14" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="2"/>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#shine)"/>
    <path d="M13 47V17h9l10 14.1L42 17h9v30h-8V29.2L32 43 21 29.2V47z" fill="#050509"/>
  </svg>`;
}

function updateFavicon() {
  const theme = currentTheme();
  let link = document.querySelector<HTMLLinkElement>('#family-os-favicon');

  if (!link) {
    link = document.createElement('link');
    link.id = 'family-os-favicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }

  link.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(theme))}`;
}

/** Keep the tab icon visually synchronized with the selected Family OS theme. */
export function installThemeFavicon() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  updateFavicon();

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'attributes' && mutation.attributeName === 'data-theme')) {
      updateFavicon();
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
