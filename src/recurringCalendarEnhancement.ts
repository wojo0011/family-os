import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';
import { calendarOccurrencesInRange, isRecurringRecord, recordRecurrence } from './recurrence';
import { ensureRecurrenceField } from './recurrenceCaptureEnhancement';

const PERSON_COLORS: Record<string, string> = {
  family: '#f4c95d', dad: '#65b8ff', mom: '#ff8fbd', teen: '#a78bfa', child: '#53d7a6',
};

let installed = false;
let queued = false;
let currentShell: Element | null = null;
let signature = '';
let unsubscribe: (() => void) | null = null;

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}

function matchesFilters(record: CaptureRecord, title: string, category: string, person: string, date: string, recurrence: string) {
  const shell = document.querySelector('.calendar-planner-shell');
  if (!shell) return false;
  const source = shell.querySelector<HTMLSelectElement>('[data-planner-filter="source"]')?.value ?? 'all';
  if (source === 'calendar') return false;
  const personFilter = shell.querySelector<HTMLSelectElement>('[data-planner-filter="person"]')?.value ?? 'all';
  if (personFilter !== 'all' && personFilter !== person) return false;
  const categoryFilter = shell.querySelector<HTMLSelectElement>('[data-planner-filter="category"]')?.value ?? 'all';
  if (categoryFilter !== 'all' && categoryFilter.toLowerCase() !== category.toLowerCase()) return false;
  const query = shell.querySelector<HTMLInputElement>('[data-planner-search]')?.value.trim().toLowerCase() ?? '';
  if (!query) return true;
  return [title, category, person, date, recurrence, record.kind, record.values.location || ''].join(' ').toLowerCase().includes(query);
}

function visibleRange() {
  const tiles = Array.from(document.querySelectorAll<HTMLElement>('.calendar-planner-shell [data-planner-day]'));
  if (!tiles.length) return null;
  const start = parseDate(tiles[0].dataset.plannerDay || '');
  const end = parseDate(tiles[tiles.length - 1].dataset.plannerDay || '');
  if (!start || !end) return null;
  end.setHours(23, 59, 59, 999);
  return { start, end, tiles };
}

function logicalSignature(records: CaptureRecord[], tiles: HTMLElement[]) {
  const shell = document.querySelector('.calendar-planner-shell');
  const controls = [
    shell?.querySelector<HTMLInputElement>('[data-planner-search]')?.value ?? '',
    shell?.querySelector<HTMLSelectElement>('[data-planner-filter="person"]')?.value ?? '',
    shell?.querySelector<HTMLSelectElement>('[data-planner-filter="category"]')?.value ?? '',
    shell?.querySelector<HTMLSelectElement>('[data-planner-filter="source"]')?.value ?? '',
  ].join('|');
  const recurring = records.filter(isRecurringRecord).map(record => `${record.id}:${record.updatedAt}:${record.values.recurrence}`).join('|');
  return `${tiles.map(tile => tile.dataset.plannerDay).join(',')}::${controls}::${recurring}`;
}

function sync() {
  const shell = document.querySelector('.calendar-planner-shell');
  const range = visibleRange();
  if (!shell || !range) return;
  if (shell !== currentShell) {
    currentShell = shell;
    signature = '';
  }

  const records = loadCaptureRecords();
  const nextSignature = logicalSignature(records, range.tiles);
  if (nextSignature === signature && shell.querySelector('[data-recurring-injected]')) return;
  signature = nextSignature;
  shell.querySelectorAll('[data-recurring-injected]').forEach(node => node.remove());

  for (const record of records.filter(isRecurringRecord)) {
    const recurrence = recordRecurrence(record);
    const occurrences = calendarOccurrencesInRange(record, range.start, range.end);
    for (const occurrence of occurrences) {
      const date = `${occurrence.start.getFullYear()}-${String(occurrence.start.getMonth() + 1).padStart(2, '0')}-${String(occurrence.start.getDate()).padStart(2, '0')}`;
      const tile = range.tiles.find(item => item.dataset.plannerDay === date);
      if (!tile) continue;
      const baseButton = tile.querySelector(`[data-planner-event="local:${CSS.escape(record.id)}"]`);
      const baseDate = record.values.date || record.values.dueDate || '';
      if (date === baseDate && baseButton) continue;
      if (!matchesFilters(record, occurrence.title, occurrence.category, occurrence.person, date, recurrence)) continue;

      const container = tile.querySelector<HTMLElement>('.planner-day-events');
      if (!container) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'planner-event planner-event-recurring';
      button.dataset.recurringInjected = 'true';
      button.dataset.recurringRecordId = record.id;
      button.dataset.recurringOccurrenceDate = date;
      button.style.setProperty('--event-color', PERSON_COLORS[occurrence.person] || PERSON_COLORS.family);
      button.innerHTML = `<span>${escapeHtml(formatTime(occurrence.start))}</span><strong>${escapeHtml(occurrence.title)}</strong><small>${escapeHtml(occurrence.category)} · ↻ ${escapeHtml(recurrence)}</small>`;
      container.appendChild(button);
    }
  }
}

function queueSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    sync();
  });
}

function fillForm(form: HTMLFormElement, values: Record<string, string>) {
  Object.entries(values).forEach(([name, value]) => {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

function waitFor<T extends Element>(selector: string, timeout = 4000): Promise<T> {
  const existing = document.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const found = document.querySelector<T>(selector);
      if (!found) return;
      observer.disconnect();
      clearTimeout(timer);
      resolve(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
  });
}

async function openSeriesEditor(record: CaptureRecord) {
  document.querySelector<HTMLButtonElement>('.capture-pro [data-capture-close]')?.click();
  const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.topbar button')).find(button => button.textContent?.includes('+ Add'));
  addButton?.click();
  const option = await waitFor<HTMLButtonElement>(`.capture-pro .capture-option[data-capture-kind="${CSS.escape(record.kind)}"]`);
  option.click();
  const form = await waitFor<HTMLFormElement>(`.capture-pro form[data-capture-form-kind="${CSS.escape(record.kind)}"]`);
  ensureRecurrenceField(form);
  fillForm(form, record.values);
  form.dataset.calendarEditRecordId = record.id;
  const heading = form.closest('.capture-view')?.querySelector<HTMLElement>('.capture-form-heading .eyebrow');
  if (heading) heading.textContent = 'Edit recurring series';
  const save = form.querySelector<HTMLButtonElement>('.capture-save');
  if (save) save.textContent = 'Save series';
  const actions = form.querySelector<HTMLElement>('.capture-form-actions');
  if (actions && !actions.querySelector('[data-calendar-delete]')) actions.insertAdjacentHTML('afterbegin', '<button type="button" class="capture-secondary calendar-delete" data-calendar-delete>Delete series</button>');
}

export function installRecurringCalendarEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  unsubscribe = subscribeCaptureRecords(queueSync);

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const recurring = target.closest<HTMLButtonElement>('[data-recurring-record-id]');
    if (!recurring?.dataset.recurringRecordId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const record = loadCaptureRecords().find(item => item.id === recurring.dataset.recurringRecordId);
    if (record) void openSeriesEditor(record);
  }, true);

  document.addEventListener('input', event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('.calendar-planner-shell')) queueSync();
  });
  document.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('.calendar-planner-shell')) queueSync();
  });

  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  queueSync();

  window.addEventListener('beforeunload', () => unsubscribe?.(), { once: true });
}
