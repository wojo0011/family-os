import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type LensId = 'family' | 'dad' | 'mom' | 'teen' | 'child';
type LensDefinition = { id: LensId; name: string; emoji: string; color: string; description: string; includes: string[]; excludes: string[]; audience: string };

const LENSES: LensDefinition[] = [
  { id: 'family', name: 'Family', emoji: '🏡', color: '#f4c95d', description: 'The shared household view with context from every family member.', includes: ['Shared family events', 'Dad events', 'Mom events', 'Teen events', 'Child events'], excludes: [], audience: 'Household overview' },
  { id: 'dad', name: 'Dad', emoji: '👨', color: '#65b8ff', description: 'Dad’s schedule plus items marked for the whole family.', includes: ['Dad events', 'Shared family events'], excludes: ['Mom-only', 'Teen-only', 'Child-only'], audience: 'Adult personal view' },
  { id: 'mom', name: 'Mom', emoji: '👩', color: '#ff8fbd', description: 'Mom’s schedule plus items marked for the whole family.', includes: ['Mom events', 'Shared family events'], excludes: ['Dad-only', 'Teen-only', 'Child-only'], audience: 'Adult personal view' },
  { id: 'teen', name: 'Teen', emoji: '🧑', color: '#a78bfa', description: 'A focused teen view with teen-specific and shared household events.', includes: ['Teen events', 'Shared family events'], excludes: ['Dad-only', 'Mom-only', 'Child-only'], audience: 'Teen focused view' },
  { id: 'child', name: 'Child', emoji: '🧒', color: '#53d7a6', description: 'A simplified child-focused view with child and shared household events.', includes: ['Child events', 'Shared family events'], excludes: ['Dad-only', 'Mom-only', 'Teen-only'], audience: 'Child focused view' },
];

const idFromName = (value?: string | null): LensId => {
  const name = (value ?? '').trim().toLowerCase();
  return name === 'dad' || name === 'mom' || name === 'teen' || name === 'child' ? name : 'family';
};

function readActiveLens() {
  return idFromName(document.querySelector<HTMLElement>('.topbar .lens-picker.compact button.active b')?.textContent);
}

function switchAppLens(id: LensId) {
  const target = LENSES.find(lens => lens.id === id);
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.topbar .lens-picker.compact button')).find(item => item.querySelector('b')?.textContent?.trim() === target?.name);
  if (!button) return false;
  button.click();
  window.dispatchEvent(new CustomEvent('family-os:lens-manager-change', { detail: { lens: id } }));
  return true;
}

export default function FamilyLensModule() {
  const [activeLens, setActiveLens] = useState<LensId>(() => readActiveLens());
  useEffect(() => {
    const sync = () => setActiveLens(readActiveLens());
    const topbar = document.querySelector('.topbar');
    sync();
    if (!topbar) return;
    const observer = new MutationObserver(sync);
    observer.observe(topbar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('family-os:lens-manager-change', sync as EventListener);
    return () => { observer.disconnect(); window.removeEventListener('family-os:lens-manager-change', sync as EventListener); };
  }, []);

  const active = useMemo(() => LENSES.find(lens => lens.id === activeLens) ?? LENSES[0], [activeLens]);
  return <div className="stack family-lens-module">
    <header className="module-hero family-lens-hero"><span className="eyebrow">Family OS · Family Hub</span><h1>Family lenses</h1><p>Switch between the household view and focused views for each family member without changing the underlying shared records.</p></header>
    <section className="panel family-lens-current" style={{ '--lens-color': active.color } as CSSProperties}><div className="family-lens-current-icon">{active.emoji}</div><div><span className="eyebrow">Current view</span><h2>{active.name} lens</h2><p>{active.description}</p><small>{active.audience}</small></div><div className="family-lens-current-badge">Active</div></section>
    <section className="family-lens-grid" aria-label="Family lenses">{LENSES.map(lens => {
      const selected = lens.id === activeLens;
      return <article className={`panel family-lens-card ${selected ? 'is-active' : ''}`} key={lens.id} style={{ '--lens-color': lens.color } as CSSProperties} data-family-lens-card={lens.id}>
        <header><span className="family-lens-card-icon">{lens.emoji}</span><div><span className="eyebrow">{lens.audience}</span><h3>{lens.name}</h3></div>{selected && <b>Active</b>}</header>
        <p>{lens.description}</p><div className="family-lens-access"><strong>Shows</strong><div>{lens.includes.map(item => <span key={item}>✓ {item}</span>)}</div></div>
        {lens.excludes.length > 0 && <div className="family-lens-hidden"><strong>Filtered from this view</strong><small>{lens.excludes.join(' · ')}</small></div>}
        <button type="button" className={`primary family-lens-action ${selected ? 'is-current' : ''}`} disabled={selected} data-family-lens-use={lens.id} onClick={() => { if (switchAppLens(lens.id)) setActiveLens(lens.id); }}>{selected ? 'Current lens' : `Use ${lens.name} lens`}</button>
      </article>;
    })}</section>
    <section className="panel family-lens-explainer"><div className="family-lens-explainer-icon">🔐</div><div><span className="eyebrow">Privacy model</span><h2>Lens filtering is not authentication.</h2><p>Family lenses change what Family OS presents in Today and Calendar. They are a viewing convenience, not a security boundary. Real protection for private data must come from account permissions and the future Family Vault/cloud authorization layer.</p></div></section>
    <section className="panel family-lens-how-it-works"><header><div><span className="eyebrow">How it works</span><h2>One household, five perspectives</h2></div></header><div className="family-lens-flow"><article><b>1</b><div><strong>Assign records</strong><small>Events belong to Family, Dad, Mom, Teen or Child.</small></div></article><article><b>2</b><div><strong>Choose a lens</strong><small>The active lens follows you through Today and Calendar.</small></div></article><article><b>3</b><div><strong>Keep shared context</strong><small>Individual lenses still include records assigned to Family.</small></div></article></div></section>
  </div>;
}
