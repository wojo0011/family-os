type MotionModule = {
  animate?: (
    target: Element,
    keyframes: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => { finished?: Promise<unknown> };
};

type CaptureKind =
  | 'Event'
  | 'Reminder'
  | 'Expense'
  | 'Scan receipt'
  | 'Medication'
  | 'Health entry'
  | 'Milestone'
  | 'Pet record'
  | 'Vehicle update'
  | 'Home maintenance'
  | 'Speak';

type CaptureDefinition = {
  kind: CaptureKind;
  icon: string;
  description: string;
  accent: string;
};

type CaptureRecord = {
  id: string;
  kind: CaptureKind;
  createdAt: string;
  values: Record<string, string>;
};

const MOTION_URL = 'https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm';
const STORAGE_KEY = 'family-os:capture-records-v1';

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
    motion.animate(target, keyframes, options);
    return;
  }

  const element = target as HTMLElement;
  const durationSeconds = typeof options.duration === 'number' ? options.duration : 0.24;
  const duration = durationSeconds * 1000;
  const frames: Keyframe[] = [];
  const keys = Object.keys(keyframes);
  const maxLength = Math.max(...keys.map(key => Array.isArray(keyframes[key]) ? (keyframes[key] as unknown[]).length : 1));
  for (let index = 0; index < maxLength; index += 1) {
    const frame: Record<string, unknown> = {};
    keys.forEach(key => {
      const value = keyframes[key];
      frame[key] = Array.isArray(value) ? value[Math.min(index, value.length - 1)] : value;
    });
    frames.push(frame as Keyframe);
  }
  element.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
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

function field(label: string, name: string, type = 'text', options: { required?: boolean; placeholder?: string; value?: string; step?: string } = {}) {
  return `<label class="capture-field"><span>${label}</span><input name="${name}" type="${type}" ${options.required ? 'required' : ''} ${options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ''} ${options.value ? `value="${escapeHtml(options.value)}"` : ''} ${options.step ? `step="${options.step}"` : ''}></label>`;
}

function selectField(label: string, name: string, options: string[]) {
  return `<label class="capture-field"><span>${label}</span><select name="${name}">${options.map(option => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function textArea(label: string, name: string, placeholder: string) {
  return `<label class="capture-field capture-field-wide"><span>${label}</span><textarea name="${name}" rows="4" placeholder="${escapeHtml(placeholder)}"></textarea></label>`;
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
        field('Amount', 'amount', 'number', { required: true, placeholder: '0.00', step: '0.01' }),
        selectField('Category', 'category', ['Groceries', 'Dining', 'Home', 'Vehicle', 'Health', 'Kids', 'Pets', 'Entertainment', 'Other']),
        field('Date', 'date', 'date', { required: true, value: date }),
        selectField('Paid by', 'person', ['Family', 'Dad', 'Mom', 'Teen']),
        textArea('Notes', 'notes', 'Optional expense note…'),
      ].join('');
    case 'Scan receipt':
      return [
        `<label class="capture-field capture-field-wide capture-file"><span>Receipt image</span><input name="receipt" type="file" accept="image/*,application/pdf"><small>The selected file stays on this device; Family OS stores only the confirmed details for now.</small></label>`,
        field('Merchant', 'merchant', 'text', { required: true, placeholder: 'Store name' }),
        field('Total', 'amount', 'number', { placeholder: '0.00', step: '0.01' }),
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
        field('Odometer (km)', 'odometer', 'number', { placeholder: 'Current mileage' }),
        field('Date', 'date', 'date', { required: true, value: date }),
        field('Cost', 'cost', 'number', { placeholder: '0.00', step: '0.01' }),
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
        textArea('Quick capture', 'transcript', 'Speak or type what you want Family OS to remember…'),
        selectField('Save as', 'saveAs', ['Quick note', 'Reminder', 'Event idea', 'Health note', 'Home note', 'Vehicle note']),
      ].join('');
  }
}

function definitionFor(kind: CaptureKind) {
  return captures.find(item => item.kind === kind) ?? captures[0];
}

function renderSelection(stage: HTMLElement) {
  stage.innerHTML = `
    <div class="capture-view capture-view-menu">
      <header class="capture-pro-header">
        <div>
          <span class="eyebrow">Universal capture</span>
          <h2>What would you like to add?</h2>
          <p>Choose a record type. Family OS will guide you through only the fields that matter.</p>
        </div>
        <button type="button" class="capture-icon-button" data-capture-close aria-label="Close">×</button>
      </header>
      <div class="capture-option-grid">
        ${captures.map(item => `
          <button type="button" class="capture-option" data-capture-kind="${item.kind}" style="--capture-accent:${item.accent}">
            <span class="capture-option-icon">${item.icon}</span>
            <span><strong>${item.kind}</strong><small>${item.description}</small></span>
            <b aria-hidden="true">›</b>
          </button>
        `).join('')}
      </div>
      <footer class="capture-pro-footer"><span>🔐 Saved locally in this browser</span><span>Structured for future Family Vault sync</span></footer>
    </div>
  `;
}

function renderForm(stage: HTMLElement, kind: CaptureKind) {
  const item = definitionFor(kind);
  stage.innerHTML = `
    <div class="capture-view capture-view-form" style="--capture-accent:${item.accent}">
      <header class="capture-pro-header capture-form-header">
        <button type="button" class="capture-icon-button capture-back" data-capture-back aria-label="Back">‹</button>
        <div class="capture-form-heading"><span class="capture-form-icon">${item.icon}</span><div><span class="eyebrow">Add record</span><h2>${item.kind}</h2><p>${item.description}</p></div></div>
        <button type="button" class="capture-icon-button" data-capture-close aria-label="Close">×</button>
      </header>
      <form class="capture-form" data-capture-form data-capture-kind="${item.kind}">
        <div class="capture-form-grid">${formFields(kind)}</div>
        <div class="capture-form-actions"><button type="button" class="capture-secondary" data-capture-back>Back</button><button type="submit" class="capture-save">Save ${item.kind}</button></div>
      </form>
    </div>
  `;
}

function renderSuccess(stage: HTMLElement, kind: CaptureKind) {
  const item = definitionFor(kind);
  stage.innerHTML = `
    <div class="capture-view capture-success" style="--capture-accent:${item.accent}">
      <div class="capture-success-mark">✓</div>
      <span class="eyebrow">Saved</span>
      <h2>${item.kind} added</h2>
      <p>The record is stored locally in Family OS on this browser.</p>
      <div><button type="button" class="capture-secondary" data-capture-add-another>Add another</button><button type="button" class="capture-save" data-capture-close>Done</button></div>
    </div>
  `;
}

function saveRecord(form: HTMLFormElement, kind: CaptureKind) {
  const data = new FormData(form);
  const values: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    values[key] = value instanceof File ? value.name : String(value);
  }
  const record: CaptureRecord = {
    id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    createdAt: new Date().toISOString(),
    values,
  };

  let existing: CaptureRecord[] = [];
  try {
    existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as CaptureRecord[];
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }
  existing.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 250)));
  window.dispatchEvent(new CustomEvent('family-os:capture-saved', { detail: record }));
  return record;
}

async function transitionStage(stage: HTMLElement, render: () => void, direction: 1 | -1) {
  await animateElement(stage, { opacity: [1, 0], x: [0, direction * -34] }, { duration: 0.16, ease: [0.4, 0, 1, 1] });
  await wait(150);
  render();
  stage.style.opacity = '0';
  stage.style.transform = `translateX(${direction * 38}px)`;
  requestAnimationFrame(() => {
    void animateElement(stage, { opacity: [0, 1], x: [direction * 38, 0] }, { duration: 0.3, ease: [0.22, 1, 0.36, 1] });
  });
}

function setupDictation(stage: HTMLElement) {
  const button = stage.querySelector<HTMLButtonElement>('[data-capture-dictate]');
  const textarea = stage.querySelector<HTMLTextAreaElement>('textarea[name="transcript"]');
  if (!button || !textarea) return;

  const win = window as Window & {
    SpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    webkitSpeechRecognition?: Window['SpeechRecognition'];
  };
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
  await wait(205);
  const originalClose = activeOverlay.querySelector<HTMLButtonElement>('.capture > header > button');
  originalClose?.click();
  activeHost.remove();
  activeHost = null;
  activeOverlay = null;
  delete document.documentElement.dataset.captureModal;
  previousFocus?.focus({ preventScroll: true });
  previousFocus = null;
  closing = false;
}

function bindStage(stage: HTMLElement) {
  stage.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const close = target.closest('[data-capture-close]');
    if (close) {
      void closeCapture();
      return;
    }

    const option = target.closest<HTMLElement>('[data-capture-kind]');
    if (option?.dataset.captureKind) {
      const kind = option.dataset.captureKind as CaptureKind;
      void transitionStage(stage, () => {
        renderForm(stage, kind);
        setupDictation(stage);
      }, 1);
      return;
    }

    if (target.closest('[data-capture-back]') || target.closest('[data-capture-add-another]')) {
      void transitionStage(stage, () => renderSelection(stage), -1);
    }
  });

  stage.addEventListener('submit', event => {
    const form = event.target as HTMLFormElement;
    if (!form.matches('[data-capture-form]')) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const kind = form.dataset.captureKind as CaptureKind;
    saveRecord(form, kind);
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
  const focusable = Array.from(activeHost.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
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
  const original = overlay.querySelector<HTMLElement>('.capture');
  if (!original) return;

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
  }
}

export function installCaptureModalEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', trapFocus);
  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.body, { childList: true, subtree: true });
  sync();
}
