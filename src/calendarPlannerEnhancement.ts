import {
  addCaptureRecord,
  captureRecordToCalendarEntry,
  loadCaptureRecords,
  removeCaptureRecord,
  subscribeCaptureRecords,
  updateCaptureRecord,
  type CaptureKind,
  type CaptureRecord,
} from './localCaptureStore';

type PlannerView = 'month' | 'week';
type PlannerSource = 'local' | 'calendar';
type PlannerEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  person: 'family' | 'dad' | 'mom' | 'teen' | 'child';
  category: string;
  location?: string;
  source: PlannerSource;
  recordId?: string;
  recordKind?: CaptureKind;
  originKey?: string;
};

type PlannerWeather = { summary: string };

const PERSON_COLORS: Record<PlannerEvent['person'], string> = {
  family: '#f4c95d', dad: '#65b8ff', mom: '#ff8fbd', teen: '#a78bfa', child: '#53d7a6',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let installed = false;
let host: HTMLElement | null = null;
let sourceCalendar: HTMLElement | null = null;
let sourceToolbar: HTMLElement | null = null;
let sourceNote: HTMLElement | null = null;
let anchor = new Date();
let view: PlannerView = 'month';
let query = '';
let personFilter = 'all';
let categoryFilter = 'all';
let sourceFilter = 'all';
let renderQueued = false;
let sourceSignature = '';
let sourceAlignTimer: number | null = null;
let unsubscribeStore: (() => void) | null = null;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseTimeLabel(label: string) {
  const text = label.trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!match) return '12:00';
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const date = new Date(2026, 0, 1, hour, minute);
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function monthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function weekDays(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function parseSourceMonth() {
  const text = sourceToolbar?.querySelector('.month-title h1')?.textContent?.trim() ?? '';
  const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const month = MONTHS.findIndex(value => value.toLowerCase() === match[1].toLowerCase());
  if (month < 0) return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return new Date(Number(match[2]), month, 1);
}

function monthDifference(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
}

function alignSourceMonth(target: Date) {
  if (!sourceToolbar || sourceAlignTimer != null) return;
  const desired = new Date(target.getFullYear(), target.getMonth(), 1);

  const step = () => {
    sourceAlignTimer = null;
    if (!sourceToolbar?.isConnected) return;
    const current = parseSourceMonth();
    const diff = monthDifference(current, desired);
    if (!diff) {
      queueRender();
      return;
    }
    const buttons = sourceToolbar.querySelectorAll<HTMLButtonElement>('.month-title button');
    const button = diff < 0 ? buttons[0] : buttons[buttons.length - 1];
    button?.click();
    sourceAlignTimer = window.setTimeout(step, 90);
  };

  step();
}

function normalizeColor(value: string) {
  const color = document.createElement('span');
  color.style.color = value;
  color.style.display = 'none';
  document.body.appendChild(color);
  const normalized = getComputedStyle(color).color.replace(/\s+/g, '').toLowerCase();
  color.remove();
  return normalized;
}

const personColorMap = new Map<string, PlannerEvent['person']>();
function personFromColor(color: string) {
  if (!personColorMap.size) {
    (Object.entries(PERSON_COLORS) as Array<[PlannerEvent['person'], string]>).forEach(([person, value]) => personColorMap.set(normalizeColor(value), person));
  }
  return personColorMap.get(normalizeColor(color)) ?? 'family';
}

function originKey(date: string, time: string, title: string) {
  return `calendar|${date}|${time}|${title.trim().toLowerCase()}`;
}

function scrapeSource() {
  const result: PlannerEvent[] = [];
  const weather = new Map<string, PlannerWeather>();
  if (!sourceCalendar) return { events: result, weather };
  const sourceMonth = parseSourceMonth();
  const days = monthDays(sourceMonth);
  const tiles = Array.from(sourceCalendar.querySelectorAll<HTMLElement>('.month-grid > article'));

  tiles.forEach((tile, index) => {
    const day = days[index];
    if (!day) return;
    const date = dateKey(day);
    const weatherText = tile.querySelector<HTMLElement>('.tile-weather')?.textContent?.replace(/\s+/g, ' ').trim();
    if (weatherText) weather.set(date, { summary: weatherText });

    tile.querySelectorAll<HTMLElement>('.event-list > div').forEach(eventNode => {
      if (eventNode.getAttribute('title') === 'Saved locally') return;
      const title = eventNode.querySelector('strong')?.textContent?.trim();
      if (!title) return;
      const time = parseTimeLabel(eventNode.querySelector('small')?.textContent ?? '');
      const person = personFromColor(eventNode.style.borderLeftColor || getComputedStyle(eventNode).borderLeftColor);
      const key = originKey(date, time, title);
      result.push({ id: key, title, date, time, person, category: 'Calendar', source: 'calendar', originKey: key });
    });
  });
  return { events: result, weather };
}

function localPlannerEvents(records: CaptureRecord[]) {
  return records.flatMap<PlannerEvent>(record => {
    const entry = captureRecordToCalendarEntry(record);
    if (!entry) return [];
    return [{
      id: `local:${record.id}`,
      title: entry.title,
      date: dateKey(entry.start),
      time: `${String(entry.start.getHours()).padStart(2, '0')}:${String(entry.start.getMinutes()).padStart(2, '0')}`,
      person: entry.person,
      category: entry.category,
      location: entry.location,
      source: 'local',
      recordId: record.id,
      recordKind: record.kind,
      originKey: record.values.originKey || undefined,
    }];
  });
}

function allPlannerEvents() {
  const records = loadCaptureRecords();
  const local = localPlannerEvents(records);
  const overridden = new Set(local.map(event => event.originKey).filter(Boolean));
  const scraped = scrapeSource();
  const source = scraped.events.filter(event => !event.originKey || !overridden.has(event.originKey));
  return { events: [...source, ...local].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)), weather: scraped.weather };
}

function filteredEvents(events: PlannerEvent[]) {
  const needle = query.trim().toLowerCase();
  return events.filter(event => {
    if (personFilter !== 'all' && event.person !== personFilter) return false;
    if (categoryFilter !== 'all' && event.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
    if (sourceFilter !== 'all' && event.source !== sourceFilter) return false;
    if (!needle) return true;
    return [event.title, event.location ?? '', event.category, event.person, event.source, event.date, formatTime(event.time)].join(' ').toLowerCase().includes(needle);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

function plannerLabel() {
  if (view === 'month') return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(anchor);
  const days = weekDays(anchor);
  const start = days[0];
  const end = days[6];
  const sameMonth = start.getMonth() === end.getMonth();
  const left = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(start);
  const right = new Intl.DateTimeFormat('en-CA', sameMonth ? { day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(end);
  return `${left} – ${right}`;
}

function eventMarkup(event: PlannerEvent) {
  const sourceLabel = event.source === 'local' ? 'Local' : 'Calendar';
  return `<button type="button" class="planner-event" data-planner-event="${escapeHtml(event.id)}" style="--event-color:${PERSON_COLORS[event.person]}"><span>${escapeHtml(formatTime(event.time))}</span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.category)} · ${sourceLabel}</small></button>`;
}

function renderDay(day: Date, events: PlannerEvent[], weather: Map<string, PlannerWeather>, expanded = false) {
  const key = dateKey(day);
  const items = events.filter(event => event.date === key);
  const today = key === dateKey(new Date());
  const otherMonth = view === 'month' && day.getMonth() !== anchor.getMonth();
  const dayWeather = weather.get(key);
  const max = expanded ? 50 : 4;
  return `<article class="planner-day ${today ? 'is-today' : ''} ${otherMonth ? 'is-outside' : ''}" data-planner-day="${key}" tabindex="0" role="button" aria-label="Add event on ${escapeHtml(new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(day))}">
    <header><span>${new Intl.DateTimeFormat('en-CA', { weekday: expanded ? 'short' : undefined }).format(day)}</span><b>${day.getDate()}</b></header>
    ${dayWeather ? `<small class="planner-weather">${escapeHtml(dayWeather.summary)}</small>` : ''}
    <div class="planner-day-events">${items.slice(0, max).map(eventMarkup).join('')}${items.length > max ? `<small class="planner-more">+${items.length - max} more</small>` : ''}</div>
    <span class="planner-day-add" aria-hidden="true">＋</span>
  </article>`;
}

function render() {
  if (!host || !sourceCalendar?.isConnected || !sourceToolbar?.isConnected) return;
  const { events: allEvents, weather } = allPlannerEvents();
  const events = filteredEvents(allEvents);
  const categories = Array.from(new Set(allEvents.map(event => event.category))).sort((a, b) => a.localeCompare(b));
  const days = view === 'month' ? monthDays(anchor) : weekDays(anchor);
  const visibleKeys = new Set(days.map(dateKey));
  const visibleEvents = events.filter(event => visibleKeys.has(event.date));
  const searchResults = query.trim() ? events.slice(0, 20) : [];

  host.innerHTML = `<section class="calendar-planner-shell panel">
    <header class="planner-header">
      <div><span class="eyebrow">Family calendar</span><div class="planner-title-row"><button type="button" data-planner-nav="prev" aria-label="Previous">‹</button><h1>${escapeHtml(plannerLabel())}</h1><button type="button" data-planner-nav="next" aria-label="Next">›</button><button type="button" class="planner-today" data-planner-nav="today">Today</button></div></div>
      <div class="planner-view-switch" role="group" aria-label="Calendar view"><button type="button" data-planner-view="week" class="${view === 'week' ? 'active' : ''}">Week</button><button type="button" data-planner-view="month" class="${view === 'month' ? 'active' : ''}">Month</button></div>
    </header>
    <div class="planner-controls">
      <label class="planner-search"><span>⌕</span><input type="search" data-planner-search placeholder="Search events, people, categories…" value="${escapeHtml(query)}"></label>
      <select data-planner-filter="person" aria-label="Filter by person"><option value="all">All people</option>${(['family','dad','mom','teen','child'] as const).map(person => `<option value="${person}" ${personFilter === person ? 'selected' : ''}>${person[0].toUpperCase() + person.slice(1)}</option>`).join('')}</select>
      <select data-planner-filter="category" aria-label="Filter by category"><option value="all">All categories</option>${categories.map(category => `<option value="${escapeHtml(category)}" ${categoryFilter === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select>
      <select data-planner-filter="source" aria-label="Filter by source"><option value="all">All sources</option><option value="local" ${sourceFilter === 'local' ? 'selected' : ''}>Local</option><option value="calendar" ${sourceFilter === 'calendar' ? 'selected' : ''}>Calendar</option></select>
      <button type="button" class="planner-clear" data-planner-clear>Clear</button>
      <span class="planner-count">${visibleEvents.length} event${visibleEvents.length === 1 ? '' : 's'}</span>
    </div>
    ${searchResults.length ? `<div class="planner-search-results"><span class="eyebrow">Search results</span>${searchResults.map(eventMarkup).join('')}</div>` : ''}
    ${view === 'month' ? `<div class="planner-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => `<b>${day}</b>`).join('')}</div><div class="planner-month-grid">${days.map(day => renderDay(day, events, weather)).join('')}</div>` : `<div class="planner-week-grid">${days.map(day => renderDay(day, events, weather, true)).join('')}</div>`}
    <footer class="planner-footer"><span>Click a day to add an event</span><span>Click an event to view or edit details</span><span>Local changes save in this browser</span></footer>
  </section>`;
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
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

function waitFor<T extends Element>(selector: string, timeout = 3000): Promise<T> {
  const existing = document.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const found = document.querySelector<T>(selector);
      if (!found) return;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
  });
}

async function openCapture(kind: CaptureKind, values: Record<string, string>, editRecordId?: string, origin?: string) {
  const existingClose = document.querySelector<HTMLButtonElement>('.capture-pro [data-capture-close]');
  existingClose?.click();
  const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.topbar button')).find(button => button.textContent?.includes('+ Add'));
  addButton?.click();

  const option = await waitFor<HTMLButtonElement>(`.capture-pro .capture-option[data-capture-kind="${CSS.escape(kind)}"]`);
  option.click();
  const form = await waitFor<HTMLFormElement>(`.capture-pro form[data-capture-form-kind="${CSS.escape(kind)}"]`);
  fillForm(form, values);

  if (editRecordId) form.dataset.calendarEditRecordId = editRecordId;
  if (origin) form.dataset.calendarOriginKey = origin;

  const heading = form.closest('.capture-view')?.querySelector<HTMLElement>('.capture-form-heading .eyebrow');
  if (heading) heading.textContent = editRecordId ? 'Edit record' : origin ? 'Edit calendar event' : 'Add event';
  const save = form.querySelector<HTMLButtonElement>('.capture-save');
  if (save && (editRecordId || origin)) save.textContent = 'Save changes';

  if (editRecordId) {
    const actions = form.querySelector<HTMLElement>('.capture-form-actions');
    if (actions && !actions.querySelector('[data-calendar-delete]')) actions.insertAdjacentHTML('afterbegin', '<button type="button" class="capture-secondary calendar-delete" data-calendar-delete>Delete</button>');
  }
  form.querySelector<HTMLElement>('[name="title"], input, textarea, select')?.focus({ preventScroll: true });
}

function formValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => { values[key] = value instanceof File ? value.name : String(value); });
  return values;
}

function showValidation(form: HTMLFormElement, errors: Record<string, string>) {
  form.querySelectorAll('.capture-field-error').forEach(node => node.remove());
  form.querySelectorAll('.capture-field-invalid').forEach(node => node.classList.remove('capture-field-invalid'));
  const summary = form.querySelector<HTMLElement>('[data-capture-validation]');
  const entries = Object.entries(errors);
  if (summary) {
    summary.hidden = !entries.length;
    summary.innerHTML = entries.length ? `<strong>Please check these fields:</strong><ul>${entries.map(([, message]) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>` : '';
  }
  entries.forEach(([fieldName, message]) => {
    const field = form.querySelector<HTMLElement>(`[data-capture-field="${CSS.escape(fieldName)}"]`);
    field?.classList.add('capture-field-invalid');
    field?.insertAdjacentHTML('beforeend', `<small class="capture-field-error">${escapeHtml(message)}</small>`);
  });
}

function closeCapture() {
  document.querySelector<HTMLButtonElement>('.capture-pro [data-capture-close]')?.click();
}

function bindGlobalCaptureEditing() {
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const editId = form.dataset.calendarEditRecordId;
    const origin = form.dataset.calendarOriginKey;
    if (!editId && !origin) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const values = formValues(form);

    if (editId) {
      const existing = loadCaptureRecords().find(record => record.id === editId);
      const result = updateCaptureRecord(editId, { ...(existing?.values ?? {}), ...values });
      if (!result.record) {
        showValidation(form, result.validation?.errors ?? { title: 'Unable to save this record.' });
        return;
      }
      closeCapture();
      return;
    }

    const result = addCaptureRecord('Event', { ...values, originKey: origin });
    if (!result.record) {
      showValidation(form, result.validation.errors);
      return;
    }
    closeCapture();
  }, true);

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const deleteButton = target.closest<HTMLButtonElement>('[data-calendar-delete]');
    if (!deleteButton) return;
    const form = deleteButton.closest<HTMLFormElement>('form[data-calendar-edit-record-id]');
    const id = form?.dataset.calendarEditRecordId;
    if (!id || !window.confirm('Delete this local calendar record?')) return;
    removeCaptureRecord(id);
    closeCapture();
  }, true);
}

function handlePlannerClick(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewButton = target.closest<HTMLButtonElement>('[data-planner-view]');
  if (viewButton?.dataset.plannerView) {
    view = viewButton.dataset.plannerView as PlannerView;
    queueRender();
    return;
  }

  const nav = target.closest<HTMLButtonElement>('[data-planner-nav]')?.dataset.plannerNav;
  if (nav) {
    if (nav === 'today') anchor = new Date();
    else if (view === 'month') anchor = new Date(anchor.getFullYear(), anchor.getMonth() + (nav === 'next' ? 1 : -1), 1);
    else {
      const next = new Date(anchor);
      next.setDate(next.getDate() + (nav === 'next' ? 7 : -7));
      anchor = next;
    }
    alignSourceMonth(anchor);
    queueRender();
    return;
  }

  if (target.closest('[data-planner-clear]')) {
    query = '';
    personFilter = categoryFilter = sourceFilter = 'all';
    queueRender();
    return;
  }

  const eventButton = target.closest<HTMLButtonElement>('[data-planner-event]');
  if (eventButton?.dataset.plannerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const { events } = allPlannerEvents();
    const item = events.find(candidate => candidate.id === eventButton.dataset.plannerEvent);
    if (!item) return;
    if (item.recordId) {
      const record = loadCaptureRecords().find(candidate => candidate.id === item.recordId);
      if (record) void openCapture(record.kind, record.values, record.id);
    } else {
      void openCapture('Event', {
        title: item.title,
        person: item.person[0].toUpperCase() + item.person.slice(1),
        date: item.date,
        time: item.time,
        location: item.location ?? '',
        category: 'Other',
        notes: '',
      }, undefined, item.originKey);
    }
    return;
  }

  const day = target.closest<HTMLElement>('[data-planner-day]');
  if (day?.dataset.plannerDay) {
    void openCapture('Event', { date: day.dataset.plannerDay, time: '09:00', person: 'Family', category: 'Family' });
  }
}

function bindHost() {
  if (!host) return;
  host.addEventListener('click', handlePlannerClick);
  host.addEventListener('keydown', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('[data-planner-day]')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void openCapture('Event', { date: target.dataset.plannerDay ?? dateKey(new Date()), time: '09:00', person: 'Family', category: 'Family' });
  });
  host.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-planner-search]')) return;
    query = input.value;
    const caret = input.selectionStart;
    queueRender();
    requestAnimationFrame(() => {
      const next = host?.querySelector<HTMLInputElement>('[data-planner-search]');
      next?.focus({ preventScroll: true });
      if (caret != null) next?.setSelectionRange(caret, caret);
    });
  });
  host.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const filter = select.dataset.plannerFilter;
    if (filter === 'person') personFilter = select.value;
    if (filter === 'category') categoryFilter = select.value;
    if (filter === 'source') sourceFilter = select.value;
    queueRender();
  });
}

function mount() {
  const calendar = document.querySelector<HTMLElement>('.content > .stack > .calendar.panel');
  const toolbar = document.querySelector<HTMLElement>('.content > .stack > .toolbar.panel');
  if (!calendar || !toolbar) return false;

  if (host?.isConnected && sourceCalendar === calendar && sourceToolbar === toolbar) return true;
  host?.remove();
  unsubscribeStore?.();
  sourceCalendar = calendar;
  sourceToolbar = toolbar;
  sourceNote = calendar.nextElementSibling instanceof HTMLElement && calendar.nextElementSibling.classList.contains('note') ? calendar.nextElementSibling : null;
  anchor = parseSourceMonth();
  host = document.createElement('div');
  host.className = 'calendar-planner-host';
  calendar.before(host);
  calendar.dataset.plannerSource = 'true';
  toolbar.dataset.plannerSource = 'true';
  if (sourceNote) sourceNote.dataset.plannerSource = 'true';
  document.documentElement.dataset.calendarPlanner = 'active';
  bindHost();
  unsubscribeStore = subscribeCaptureRecords(() => queueRender());
  sourceSignature = '';
  render();
  return true;
}

function unmount() {
  host?.remove();
  host = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
  sourceCalendar = null;
  sourceToolbar = null;
  sourceNote = null;
  delete document.documentElement.dataset.calendarPlanner;
}

function sync() {
  const calendar = document.querySelector<HTMLElement>('.content > .stack > .calendar.panel');
  const toolbar = document.querySelector<HTMLElement>('.content > .stack > .toolbar.panel');
  if (!calendar || !toolbar) {
    if (host) unmount();
    return;
  }
  mount();
  const signature = `${toolbar.querySelector('.month-title h1')?.textContent ?? ''}|${calendar.querySelector('.month-grid')?.textContent ?? ''}`;
  if (signature !== sourceSignature) {
    sourceSignature = signature;
    queueRender();
  }
}

export function installCalendarPlannerEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  bindGlobalCaptureEditing();
  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('click', () => queueMicrotask(sync), true);
  window.addEventListener('family-os:app-ready', sync);
  sync();
}
