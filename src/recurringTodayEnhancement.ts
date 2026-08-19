import { loadCaptureRecords, subscribeCaptureRecords } from './localCaptureStore';
import { calendarOccurrencesInRange, isRecurringRecord, recordRecurrence } from './recurrence';

const PERSON_COLORS: Record<string, string> = {
  family: '#f4c95d', dad: '#65b8ff', mom: '#ff8fbd', teen: '#a78bfa', child: '#53d7a6',
};
const PERSON_LABELS: Record<string, string> = { family: '🏡 Family', dad: '👨 Dad', mom: '👩 Mom', teen: '🧑 Teen', child: '🧒 Child' };

let installed = false;
let queued = false;
let timelineIdentity: Element | null = null;
let signature = '';
let unsubscribe: (() => void) | null = null;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function sync() {
  const timeline = document.querySelector('.timeline');
  if (!timeline) return;
  if (timeline !== timelineIdentity) {
    timelineIdentity = timeline;
    signature = '';
  }

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  const records = loadCaptureRecords().filter(isRecurringRecord);
  const nextSignature = `${dateKey(today)}|${records.map(record => `${record.id}:${record.updatedAt}:${record.values.recurrence}`).join('|')}`;
  if (signature === nextSignature && timeline.querySelector('[data-recurring-today]')) return;
  signature = nextSignature;
  timeline.querySelectorAll('[data-recurring-today]').forEach(node => node.remove());

  for (const record of records) {
    const occurrences = calendarOccurrencesInRange(record, start, end);
    const baseDate = record.values.date || record.values.dueDate || '';
    for (const occurrence of occurrences) {
      if (baseDate === dateKey(occurrence.start)) continue; // React already renders the first occurrence.
      const article = document.createElement('article');
      article.dataset.recurringToday = record.id;
      article.innerHTML = `<time>${formatTime(occurrence.start)}</time><i style="background:${PERSON_COLORS[occurrence.person] || PERSON_COLORS.family}"></i><div><strong>${occurrence.title}</strong><small>${PERSON_LABELS[occurrence.person] || PERSON_LABELS.family} · ↻ ${recordRecurrence(record)}</small></div><div class="timeline-local-actions"><em>Recurring</em></div>`;
      timeline.appendChild(article);
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

export function installRecurringTodayEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  unsubscribe = subscribeCaptureRecords(queueSync);
  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  queueSync();
  window.addEventListener('beforeunload', () => unsubscribe?.(), { once: true });
}
