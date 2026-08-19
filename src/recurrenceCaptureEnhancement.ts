import { loadCaptureRecords } from './localCaptureStore';
import { SIMPLE_RECURRENCES } from './recurrence';

let installed = false;

function ensureRecurrenceField(form: HTMLFormElement) {
  const kind = form.dataset.captureFormKind;
  if (kind !== 'Event' && kind !== 'Reminder') return;
  if (form.elements.namedItem('recurrence')) return;
  const grid = form.querySelector<HTMLElement>('.capture-form-grid');
  if (!grid) return;

  const label = document.createElement('label');
  label.className = 'capture-field';
  label.dataset.captureField = 'recurrence';
  label.innerHTML = `<span>Repeats</span><select name="recurrence">${SIMPLE_RECURRENCES.map(value => `<option value="${value}">${value}</option>`).join('')}</select>`;
  const notes = grid.querySelector<HTMLElement>('[data-capture-field="notes"]');
  grid.insertBefore(label, notes ?? null);
  hydrateEditValue(form);
}

function hydrateEditValue(form: HTMLFormElement) {
  const select = form.elements.namedItem('recurrence');
  if (!(select instanceof HTMLSelectElement)) return;
  const editId = form.dataset.calendarEditRecordId;
  if (!editId) return;
  const record = loadCaptureRecords().find(item => item.id === editId);
  if (!record) return;
  select.value = record.values.recurrence || 'Does not repeat';
}

function scan(root: ParentNode = document) {
  if (root instanceof HTMLFormElement && root.matches('form[data-capture-form-kind]')) ensureRecurrenceField(root);
  root.querySelectorAll<HTMLFormElement>('form[data-capture-form-kind]').forEach(ensureRecurrenceField);
}

export function installRecurrenceCaptureEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  scan();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLFormElement) {
        ensureRecurrenceField(record.target);
        hydrateEditValue(record.target);
        continue;
      }
      record.addedNodes.forEach(node => {
        if (node instanceof Element) scan(node);
      });
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-calendar-edit-record-id'],
  });
}

export { ensureRecurrenceField };
