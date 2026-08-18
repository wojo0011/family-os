import {
  addCaptureRecord,
  captureRecordDateLabel,
  captureRecordSummary,
  loadCaptureRecords,
  removeCaptureRecord,
  type CaptureKind,
} from './localCaptureStore';

type MotionModule = {
  animate?: (
    target: Element,
    keyframes: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => { finished?: Promise<unknown> };
};

type CaptureDefinition = {
  kind: CaptureKind;
  icon: string;
  description: string;
  accent: string;
};

const MOTION_URL = 'https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm';

const captures: CaptureDefinition[] = [
  { kind: 'Event', icon: '📅', description: 'Time, place, person and notes', accent: '#65b8ff' },
  { kind: 'Reminder', icon: '✓', description: 'A task with a due date or time', accent: '#53d7a6' },
  { kind: 'Expense', icon: '💵', description: 'Amount, merchant and category', accent: '#f4c95d' },
  { kind: 'Scan receipt', icon: '🧾', description: 'Attach a receipt and confirm details', accent: '#ffb66b' },
  { kind: 'Medication', icon: '💊', description: 'Medicine, directions and schedule', accent: '#a78bfa' },
  { kind: 'Health entry', icon: '🌡', description: 'Symptoms, reading or health note', accent: '#ff8fbd' },
  { kind: 'Milestone', icon: '🎂', description: 'Birthday, first, graduation or memory', accent: '#ff9fc8' },
  { kind: 'Pet record', icon: '🐕', description: 'Vet, medication, vaccination or note', accent: '#8ee7c5' },
  { kind: 'Vehicle update', icon: '🚗', description: 'Mileage, service or vehicle note', accent: '#71dcff' },
  { kind: 'Home maintenance', icon: '⌂', description: 'Maintenance task, due date or cadence', accent: '#dec66e' },
  { kind: 'Speak', icon: '🎙', description: 'Dictate or type a quick family note', accent: '#cdb3ff' },
];

let installed = false;
let activeHost: HTMLDivElement | null = null;
let activeOverlay: HTMLElement | null = null;
let previousFocus: HTMLElement | null = null;
let motionPromise: Promise<MotionModule | null> | null = null;
let closing = false;
let transitioning = false;

function loadMotion() {
  if (!motionPromise) {
    motionPromise = import(/* @vite-ignore */ MOTION_URL)
      .then(module => module as MotionModule)
      .catch(error => {
        console.warn('Family OS capture animation library could not load; using browser animation fallback.', error);
        return null;
      });
  }
  return motionPromise;
}

async function animateElement(
  target: Element | null,
  keyframes: Record<string, unknown>,
  options: Record<string, unknown>,
) {
  if (!target) return;
  const motion = await loadMotion();
  if (motion?.animate) {
    const animation = motion.animate(target, keyframes, options);
    await animation.finished?.catch(() => undefined);
    return;
  }

  const element = target as HTMLElement;
  const durationSeconds = typeof options.duration === 'number' ? options.duration : 0.24;
  const keys = Object.keys(keyframes);
  const maxLength = Math.max(...keys.map(key => Array.isArray(keyframes[key]) ? (keyframes[key] as unknown[]).length : 1));
  const frames: Keyframe[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const frame: Record<string, unknown> = {};
    keys.forEach(key => {
      const value = keyframes[key];
      frame[key] = Array.isArray(value) ? value[Math.min(index, value.length - 1)] : value;
    });
    frames.push(frame as Keyframe);
  }

  const animation = element.animate(frames, {
    duration: durationSeconds * 1000,
    easing: 'cubic-bezier(.22,1,.36,1)',
    fill: 'forwards',
  });
  await animation.finished.catch(() => undefined);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char] ?? char));
}

function todayValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function field(
  label: string,
  name: string,
  type = 'text',
  options: { required?: boolean; placeholder?: string; value?: string; step?: string; min?: string; max?: string } = {},
) {
  return `<label class="capture-field" data-capture-field="${name}"><span>${label}</span><input name="${name}" type="${type}" ${options.required ? 'required' : ''} ${options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ''} ${options.value ? `value="${escapeHtml(options.value)}"` : ''} ${options.step ? `step="${options.step}"` : ''} ${options.min ? `min="${options.min}"` : ''} ${options.max ? `max="${options.max}"` : ''}></label>`;
}

function selectField(label: string, name: string, options: string[]) {
  return `<label class="capture-field" data-capture-field="${name}"><span>${label}</span><select name="${name}">${options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function textArea(label: string, name: string, placeholder: string, required = false) {
  return `<label class="capture-field capture-field-wide" data-capture-field="${name}"><span>${label}</span><textarea name="${name}" rows="4" ${required ? 'required' : ''} placeholder="${escapeHtml(placeholder)}"></textarea></label>`;
}

function formFields(kind: CaptureKind) {
  const date = todayValue();
  const time = timeValue();

  switch (kind) {
    case 'Event':
      return [
        field('Event title', 'title', 'text', { required: true, placeholder: 'Family dinner' }),
        selectField('Who', 'person', ['Family', 'Dad', 'Mom', 'Teen', 'Child']),
        field('Date', 'date', 'date', { required: true, value: date }),
        field('Time', 'time', 'time', { required: true, value: time }),
        field('Location', 'location', 'text', { placeholder: 'Optional location' }),
        selectField('Type', 'category', ['Family', 'School', 'Sport', 'Appointment', 'Work', 'Other']),
        textArea('Notes', 'notes', 'Anything the family should know…'),
      ].join('');
    case 'Reminder':
      return [
        field('Reminder', 'title', 'text', { required: true, placeholder: 'Call the dentist' }),
        selectField('Who', 'person', ['Family', 'Dad', 'Mom', 'Teen', 'Child']),
        field('Due date', 'date', 'date', { required: true, value: date }),
        field('Due time', 'time', 'time', { value: time }),
        selectField('Priority', 'priority', ['Normal', 'Important', 'Urgent']),
        textArea('Notes', 'notes', 'Optional context…'),
      ].join('');
    case 'Expense':
      return [
        field('Merchant / description', 'merchant', 'text', { required: true, placeholder: 'Groceries' }),
        field('Amount', 'amount', 'number', { required: true, placeholder: '0.00', step: '0.01', min: '0.01' }),
        selectField('Category', 'category', ['Groceries', 'Dining', 'Home', 'Vehicle', 'Health', 'Kids', 'Pets', 'Entertainment', 'Other']),
        field('Date', 'date', 'date', { required: true, value: date }),
        selectField('Paid by', 'person', ['Family', 'Dad', 'Mom', 'Teen']),
        textArea('Notes', 'notes', 'Optional expense note…'),
      ].join('');
    case 'Scan receipt':
      return [
        `<label class="capture-field capture-field-wide capture-file" data-capture-field="receipt"><span>Receipt image</span><input name="receipt" type="file" accept="image/*,application/pdf"><small>The file itself stays on this device; only its name and confirmed record details are stored for now.</small></label>`,
        field('Merchant', 'merchant', 'text', { required: true, placeholder: 'Store name' }),
        field('Total', 'amount', 'number', { placeholder: '0.00', step: '0.01', min: '0.01' }),
        field('Date', 'date', 'date', { value: date }),
        selectField('Category', 'category', ['Groceries', 'Dining', 'Home', 'Vehicle', 'Health', 'Kids', 'Pets', 'Other']),
        textArea('Notes', 'notes', 'Add a note before saving…'),
      ].join('');
    case 'Medication':
      return [
        field('Medication', 'medication', 'text', { required: true, placeholder: 'Medication name' }),
        field('Directions', 'directions', 'text', { required: true, placeholder: '1 tablet with food' }),
        field('Start date', 'startDate', 'date', { required: true, value: date }),
        field('Schedule time', 'time', 'time', { value: time }),
        field('End date', 'endDate', 'date'),
        selectField('For', 'person', ['Dad', 'Mom', 'Teen', 'Child', 'Family']),
        textArea('Notes', 'notes', 'Prescription label details or instructions…'),
      ].join('');
    case 'Health entry':
      return [
        selectField('Entry type', 'entryType', ['Temperature', 'Symptom', 'Blood pressure', 'Heart rate', 'Weight', 'Doctor note', 'Other']),
        field('Reading / value', 'value', 'text', { required: true, placeholder: 'e.g. 38.1 °C' }),
        selectField('For', 'person', ['Dad', 'Mom', 'Teen', 'Child']),
        field('Date', 'date', 'date', { required: true, value: date }),
        field('Time', 'time', 'time', { required: true, value: time }),
        textArea('Notes', 'notes', 'Symptoms, context, medication taken, hydration, etc.'),
      ].join('');
    case 'Milestone':
      return [
        field('Milestone', 'title', 'text', { required: true, placeholder: 'First day of school' }),
        selectField('Who', 'person', ['Family', 'Dad', 'Mom', 'Teen', 'Child']),
        selectField('Type', 'milestoneType', ['Birthday', 'First', 'Graduation', 'Anniversary', 'Achievement', 'Memory', 'Other']),
        field('Date', 'date', 'date', { required: true, value: date }),
        textArea('Memory / notes', 'notes', 'What made this moment special?'),
      ].join('');
    case 'Pet record':
      return [
        field('Pet name', 'pet', 'text', { required: true, placeholder: 'Max' }),
        selectField('Record type', 'recordType', ['Vet appointment', 'Vaccination', 'Medication', 'Grooming', 'Weight', 'Birthday', 'Adoption day', 'Note']),
        field('Date', 'date', 'date', { required: true, value: date }),
        field('Provider / place', 'provider', 'text', { placeholder: 'Optional' }),
        textArea('Details', 'notes', 'Treatment, dosage, result, reminder, etc.'),
      ].join('');
    case 'Vehicle update':
      return [
        field('Vehicle', 'vehicle', 'text', { required: true, placeholder: '2015 Volkswagen Jetta TDI' }),
        selectField('Update type', 'updateType', ['Mileage', 'Service', 'Repair', 'Fuel', 'Insurance', 'Registration', 'Tire change', 'Other']),
        field('Odometer (km)', 'odometer', 'number', { placeholder: 'Current mileage', min: '0' }),
        field('Date', 'date', 'date', { required: true, value: date }),
        field('Cost', 'cost', 'number', { placeholder: '0.00', step: '0.01', min: '0' }),
        textArea('Details', 'notes', 'Work completed, parts, shop, next service, etc.'),
      ].join('');
    case 'Home maintenance':
      return [
        field('Task', 'task', 'text', { required: true, placeholder: 'Change furnace filter' }),
        selectField('Area', 'area', ['Whole home', 'HVAC', 'Kitchen', 'Bathroom', 'Exterior', 'Safety', 'Appliance', 'Yard', 'Other']),
        field('Due / completed date', 'date', 'date', { required: true, value: date }),
        selectField('Repeat', 'repeat', ['No repeat', 'Monthly', 'Every 3 months', 'Every 6 months', 'Yearly', 'Custom']),
        textArea('Details', 'notes', 'Model, filter size, contractor, parts, notes…'),
      ].join('');
    case 'Speak':
      return [
        `<div class="capture-dictation capture-field-wide"><button type="button" class="capture-dictate" data-capture-dictate>🎙 Start dictation</button><small>Uses browser speech recognition when available. You can always type instead.</small></div>`,
        textArea('Quick capture', 'transcript', 'Speak or type what you want Family OS to remember…', true),
        selectField('Save as', 'saveAs', ['Quick note', 'Reminder', 'Event idea', 'Health note', 'Home note', 'Vehicle note']),
      ].join('');
  }
}

function definitionFor(kind: CaptureKind) {
  return captures.find(item => item.kind === kind) ?? captures[0];
}

function renderSavedRecords() {
  const records = loadCaptureRecords();
  if (!records.length) return '';

  return `
    <section class="capture-local-records">
      <div class="capture-local-head"><div><span class="eyebrow">Saved locally</span><strong>${records.length} record${records.length === 1 ? '' : 's'}</strong></div><small>Recent records · remove anything you no longer need</small></div>
      <div class="capture-local-list">
        ${records.slice(0, 8).map(record => {
          const definition = definitionFor(record.kind);
          return `<article class="capture-local-row" data-capture-record="${escapeHtml(record.id)}" style="--capture-accent:${definition.accent}">
            <span class="capture-local-icon">${definition.icon}</span>
            <div><strong>${escapeHtml(captureRecordSummary(record))}</strong><small>${escapeHtml(record.kind)} · ${escapeHtml(captureRecordDateLabel(record))}</small></div>
            <button type="button" data-capture-delete="${escapeHtml(record.id)}" aria-label="Remove ${escapeHtml(record.kind)}">Remove</button>
          </article>`;
        }).join('')}
      </div>
    </section>`;
}

function renderSelection(stage: HTMLElement) {
  stage.dataset.captureView = 'menu';
  stage.innerHTML = `
    <div class="capture-view capture-view-menu">
      <header class="capture-pro-header">
        <div><span class="eyebrow">Universal capture</span><h2>What would you like to add?</h2><p>Choose a record type. Family OS validates it, saves it locally, and updates the relevant views immediately.</p></div>
        <button type="button" class="capture-icon-button" data-capture-close aria-label="Close">×</button>
      </header>
      <div class="capture-option-grid">
        ${captures.map(item => `<button type="button" class="capture-option" data-capture-kind="${item.kind}" style="--capture-accent:${item.accent}"><span class="capture-option-icon">${item.icon}</span><span><strong>${item.kind}</strong><small>${item.description}</small></span><b aria-hidden="true">›</b></button>`).join('')}
      </div>
      ${renderSavedRecords()}
      <footer class="capture-pro-footer"><span>🔐 Local browser storage</span><span>Ready for future Google Calendar / cloud adapters</span></footer>
    </div>`;
}

function renderForm(stage: HTMLElement, kind: CaptureKind) {
  const item = definitionFor(kind);
  stage.dataset.captureView = 'form';
  stage.innerHTML = `
    <div class="capture-view capture-view-form" style="--capture-accent:${item.accent}">
      <header class="capture-pro-header capture-form-header">
        <button type="button" class="capture-icon-button capture-back" data-capture-back aria-label="Back">‹</button>
        <div class="capture-form-heading"><span class="capture-form-icon">${item.icon}</span><div><span class="eyebrow">Add record</span><h2>${item.kind}</h2><p>${item.description}</p></div></div>
        <button type="button" class="capture-icon-button" data-capture-close aria-label="Close">×</button>
      </header>
      <form class="capture-form" data-capture-form data-capture-form-kind="${item.kind}" novalidate>
        <div class="capture-validation-summary" data-capture-validation hidden></div>
        <div class="capture-form-grid">${formFields(kind)}</div>
        <div class="capture-form-actions"><button type="button" class="capture-secondary" data-capture-back>Back</button><button type="submit" class="capture-save">Save ${item.kind}</button></div>
      </form>
    </div>`;
}

function renderSuccess(stage: HTMLElement, kind: CaptureKind) {
  const item = definitionFor(kind);
  stage.dataset.captureView = 'success';
  stage.innerHTML = `<div class="capture-view capture-success" style="--capture-accent:${item.accent}"><div class="capture-success-mark">✓</div><span class="eyebrow">Saved locally</span><h2>${item.kind} added</h2><p>The record is validated, persisted in this browser, and available to Family OS immediately.</p><div><button type="button" class="capture-secondary" data-capture-add-another>Add another</button><button type="button" class="capture-save" data-capture-close>Done</button></div></div>`;
}

function formValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  const data = new FormData(form);
  for (const [key, value] of data.entries()) values[key] = value instanceof File ? value.name : String(value);
  return values;
}

function clearValidation(form: HTMLFormElement) {
  form.querySelector<HTMLElement>('[data-capture-validation]')?.setAttribute('hidden', '');
  form.querySelectorAll('.capture-field-error').forEach(node => node.remove());
  form.querySelectorAll('.capture-field-invalid').forEach(node => node.classList.remove('capture-field-invalid'));
}

function showValidation(form: HTMLFormElement, errors: Record<string, string>) {
  clearValidation(form);
  const entries = Object.entries(errors);
  if (!entries.length) return;

  const summary = form.querySelector<HTMLElement>('[data-capture-validation]');
  if (summary) {
    summary.removeAttribute('hidden');
    summary.innerHTML = `<strong>Please check ${entries.length === 1 ? 'this field' : 'these fields'}:</strong><ul>${entries.map(([, message]) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`;
  }

  let firstControl: HTMLElement | null = null;
  entries.forEach(([fieldName, message]) => {
    const container = form.querySelector<HTMLElement>(`[data-capture-field="${CSS.escape(fieldName)}"]`);
    const control = form.querySelector<HTMLElement>(`[name="${CSS.escape(fieldName)}"]`);
    container?.classList.add('capture-field-invalid');
    if (container) container.insertAdjacentHTML('beforeend', `<small class="capture-field-error">${escapeHtml(message)}</small>`);
    if (!firstControl && control) firstControl = control;
  });
  firstControl?.focus({ preventScroll: false });
}

function clearStageAnimationStyles(stage: HTMLElement) {
  stage.style.removeProperty('opacity');
  stage.style.removeProperty('transform');
  stage.style.removeProperty('translate');
}

async function transitionStage(stage: HTMLElement, render: () => void, direction: 1 | -1) {
  if (transitioning) return;
  transitioning = true;

  try {
    await animateElement(stage, { opacity: [1, 0], x: [0, direction * -34] }, { duration: 0.16, ease: [0.4, 0, 1, 1] });
    render();
    stage.scrollTop = 0;
    stage.style.opacity = '0';
    stage.style.transform = `translateX(${direction * 38}px)`;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await animateElement(stage, { opacity: [0, 1], x: [direction * 38, 0] }, { duration: 0.3, ease: [0.22, 1, 0.36, 1] });
    clearStageAnimationStyles(stage);
    stage.scrollTop = 0;
  } finally {
    transitioning = false;
  }
}

function setupDictation(stage: HTMLElement) {
  const button = stage.querySelector<HTMLButtonElement>('[data-capture-dictate]');
  const textarea = stage.querySelector<HTMLTextAreaElement>('textarea[name="transcript"]');
  if (!button || !textarea) return;

  const win = window as Window & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition };
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Recognition) {
    button.disabled = true;
    button.textContent = '🎙 Dictation unavailable in this browser';
    return;
  }

  button.addEventListener('click', () => {
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-CA';
    recognition.interimResults = true;
    recognition.continuous = false;
    button.textContent = '● Listening…';
    button.classList.add('is-listening');
    recognition.onresult = event => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      textarea.value = transcript.trim();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    recognition.onend = () => {
      button.textContent = '🎙 Start dictation';
      button.classList.remove('is-listening');
    };
    recognition.onerror = recognition.onend;
    recognition.start();
  });
}

async function closeCapture() {
  if (closing || !activeHost || !activeOverlay) return;
  closing = true;
  const modal = activeHost.querySelector('.capture-pro');
  void animateElement(modal, { opacity: [1, 0], scale: [1, 0.975], y: [0, 14] }, { duration: 0.2, ease: [0.4, 0, 1, 1] });
  void animateElement(activeOverlay, { opacity: [1, 0] }, { duration: 0.22, ease: 'easeOut' });
  await new Promise(resolve => window.setTimeout(resolve, 205));
  activeOverlay.querySelector<HTMLButtonElement>('.capture > header > button')?.click();
  activeHost.remove();
  activeHost = null;
  activeOverlay = null;
  delete document.documentElement.dataset.captureModal;
  previousFocus?.focus({ preventScroll: true });
  previousFocus = null;
  closing = false;
  transitioning = false;
}

function bindStage(stage: HTMLElement) {
  stage.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const closeButton = target.closest<HTMLElement>('[data-capture-close]');
    if (closeButton) {
      void closeCapture();
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>('[data-capture-delete]');
    if (deleteButton?.dataset.captureDelete) {
      const id = deleteButton.dataset.captureDelete;
      if (!window.confirm('Remove this local Family OS record?')) return;
      const row = deleteButton.closest<HTMLElement>('[data-capture-record]');
      void animateElement(row, { opacity: [1, 0], height: [row?.offsetHeight ?? 48, 0], scale: [1, 0.98] }, { duration: 0.2, ease: 'easeOut' }).then(() => {
        removeCaptureRecord(id);
        renderSelection(stage);
      });
      return;
    }

    const backButton = target.closest<HTMLElement>('[data-capture-back], [data-capture-add-another]');
    if (backButton) {
      void transitionStage(stage, () => renderSelection(stage), -1);
      return;
    }

    // Only an actual menu option can navigate into a form. Forms deliberately
    // use data-capture-form-kind, so inputs/labels/selects can never match here.
    const option = target.closest<HTMLButtonElement>('.capture-option[data-capture-kind]');
    if (!option || !option.dataset.captureKind) return;
    const kind = option.dataset.captureKind as CaptureKind;
    void transitionStage(stage, () => {
      renderForm(stage, kind);
      setupDictation(stage);
    }, 1);
  });

  stage.addEventListener('input', event => {
    const control = event.target;
    if (!(control instanceof HTMLElement)) return;
    const field = control.closest<HTMLElement>('[data-capture-field]');
    if (!field) return;
    field.classList.remove('capture-field-invalid');
    field.querySelector('.capture-field-error')?.remove();
  });

  stage.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-capture-form]')) return;
    event.preventDefault();
    const kind = form.dataset.captureFormKind as CaptureKind | undefined;
    if (!kind) {
      console.error('Family OS capture form is missing its record kind.');
      return;
    }
    const result = addCaptureRecord(kind, formValues(form));
    if (!result.record) {
      showValidation(form, result.validation.errors);
      return;
    }
    clearValidation(form);
    void transitionStage(stage, () => renderSuccess(stage, kind), 1);
  });
}

function trapFocus(event: KeyboardEvent) {
  if (!activeHost) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeCapture();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = Array.from(activeHost.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  ));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function enhanceOverlay(overlay: HTMLElement) {
  if (overlay.dataset.captureEnhanced === 'true' || activeHost) return;
  if (!overlay.querySelector<HTMLElement>('.capture')) return;

  overlay.dataset.captureEnhanced = 'true';
  overlay.classList.add('capture-overlay-centered');
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeOverlay = overlay;
  document.documentElement.dataset.captureModal = 'open';

  const host = document.createElement('div');
  host.className = 'capture-pro-host';
  host.innerHTML = `<section class="capture-pro" role="dialog" aria-modal="true" aria-label="Universal capture"><div class="capture-pro-stage"></div></section>`;
  document.body.appendChild(host);
  activeHost = host;

  const modal = host.querySelector<HTMLElement>('.capture-pro')!;
  const stage = host.querySelector<HTMLElement>('.capture-pro-stage')!;
  renderSelection(stage);
  bindStage(stage);
  host.addEventListener('mousedown', event => {
    if (event.target === host) void closeCapture();
  });

  requestAnimationFrame(() => {
    void animateElement(overlay, { opacity: [0, 1] }, { duration: 0.22, ease: 'easeOut' });
    void animateElement(modal, { opacity: [0, 1], scale: [0.965, 1], y: [22, 0] }, { duration: 0.38, ease: [0.22, 1, 0.36, 1] });
    stage.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  });
}

function sync() {
  const overlay = document.querySelector<HTMLElement>('.overlay');
  if (overlay) {
    enhanceOverlay(overlay);
    return;
  }

  if (activeHost) {
    activeHost.remove();
    activeHost = null;
    activeOverlay = null;
    delete document.documentElement.dataset.captureModal;
    closing = false;
    transitioning = false;
  }
}

export function installCaptureModalController() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', trapFocus);
  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.body, { childList: true, subtree: true });
  sync();
}
