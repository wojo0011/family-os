import {
  addCaptureRecord,
  BILL_RECURRENCES,
  captureRecordDateLabel,
  captureRecordSummary,
  EVENT_CATEGORIES,
  loadCaptureRecords,
  MONEY_CATEGORIES,
  PAYMENT_METHODS,
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

type FieldDefinition = {
  label: string;
  name: string;
  type?: 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'file';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  step?: string;
  min?: string;
  defaultValue?: 'today' | 'nextHour';
  wide?: boolean;
};

const MOTION_URL = 'https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm';

const captures: CaptureDefinition[] = [
  { kind: 'Event', icon: '📅', description: 'Type, time, place, person and notes', accent: '#65b8ff' },
  { kind: 'Reminder', icon: '✓', description: 'A task with a due date or time', accent: '#53d7a6' },
  { kind: 'Bill', icon: '💡', description: 'Amount, due date, recurrence and payment status', accent: '#70d7c7' },
  { kind: 'Expense', icon: '💵', description: 'Amount, merchant, category and payment method', accent: '#f4c95d' },
  { kind: 'Scan receipt', icon: '🧾', description: 'Receipt details, totals and optional bill link', accent: '#ffb66b' },
  { kind: 'Medication', icon: '💊', description: 'Medicine, directions and schedule', accent: '#a78bfa' },
  { kind: 'Health entry', icon: '🌡', description: 'Symptoms, reading or health note', accent: '#ff8fbd' },
  { kind: 'Milestone', icon: '🎂', description: 'Birthday, first, graduation or memory', accent: '#ff9fc8' },
  { kind: 'Pet record', icon: '🐕', description: 'Vet, medication, vaccination or note', accent: '#8ee7c5' },
  { kind: 'Vehicle update', icon: '🚗', description: 'Mileage, service or vehicle note', accent: '#71dcff' },
  { kind: 'Home maintenance', icon: '⌂', description: 'Maintenance task, due date or cadence', accent: '#dec66e' },
  { kind: 'Speak', icon: '🎙', description: 'Dictate or type a quick family note', accent: '#cdb3ff' },
];

const personOptions = ['Family', 'Dad', 'Mom', 'Teen', 'Child'];
const moneyPeople = ['Family', 'Dad', 'Mom', 'Teen'];

const schemas: Record<CaptureKind, FieldDefinition[]> = {
  Event: [
    { label: 'Event title', name: 'title', required: true, placeholder: 'Family dinner' },
    { label: 'Event type', name: 'category', type: 'select', options: [...EVENT_CATEGORIES] },
    { label: 'Who', name: 'person', type: 'select', options: personOptions },
    { label: 'Date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Time', name: 'time', type: 'time', required: true, defaultValue: 'nextHour' },
    { label: 'Location', name: 'location', placeholder: 'Optional location' },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Anything the family should know…', wide: true },
  ],
  Reminder: [
    { label: 'Reminder', name: 'title', required: true, placeholder: 'Call the dentist' },
    { label: 'Who', name: 'person', type: 'select', options: personOptions },
    { label: 'Due date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Due time', name: 'time', type: 'time', defaultValue: 'nextHour' },
    { label: 'Priority', name: 'priority', type: 'select', options: ['Normal', 'Important', 'Urgent'] },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Optional context…', wide: true },
  ],
  Bill: [
    { label: 'Bill / payee', name: 'bill', required: true, placeholder: 'Hydro' },
    { label: 'Amount', name: 'amount', type: 'number', required: true, placeholder: '0.00', step: '0.01', min: '0.01' },
    { label: 'Due date', name: 'dueDate', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Category', name: 'category', type: 'select', options: [...MONEY_CATEGORIES] },
    { label: 'Recurrence', name: 'recurrence', type: 'select', options: [...BILL_RECURRENCES] },
    { label: 'Responsible person', name: 'person', type: 'select', options: moneyPeople },
    { label: 'Status', name: 'status', type: 'select', options: ['Unpaid', 'Paid'] },
    { label: 'Autopay', name: 'autopay', type: 'select', options: ['No', 'Yes'] },
    { label: 'Paid date', name: 'paidDate', type: 'date' },
    { label: 'Account / reference', name: 'account', placeholder: 'Optional account number or reference' },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Billing details, payment instructions, renewal context…', wide: true },
  ],
  Expense: [
    { label: 'Merchant / description', name: 'merchant', required: true, placeholder: 'Groceries' },
    { label: 'Amount', name: 'amount', type: 'number', required: true, placeholder: '0.00', step: '0.01', min: '0.01' },
    { label: 'Tax', name: 'tax', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
    { label: 'Category', name: 'category', type: 'select', options: [...MONEY_CATEGORIES] },
    { label: 'Date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Paid by', name: 'person', type: 'select', options: moneyPeople },
    { label: 'Payment method', name: 'paymentMethod', type: 'select', options: [...PAYMENT_METHODS] },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Optional expense note…', wide: true },
  ],
  'Scan receipt': [
    { label: 'Receipt image / PDF', name: 'receipt', type: 'file', wide: true },
    { label: 'Merchant', name: 'merchant', required: true, placeholder: 'Store name' },
    { label: 'Total', name: 'amount', type: 'number', placeholder: '0.00', step: '0.01', min: '0.01' },
    { label: 'Subtotal', name: 'subtotal', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
    { label: 'Tax', name: 'tax', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
    { label: 'Tip', name: 'tip', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
    { label: 'Date', name: 'date', type: 'date', defaultValue: 'today' },
    { label: 'Category', name: 'category', type: 'select', options: [...MONEY_CATEGORIES] },
    { label: 'Paid by', name: 'person', type: 'select', options: moneyPeople },
    { label: 'Payment method', name: 'paymentMethod', type: 'select', options: [...PAYMENT_METHODS] },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Add a note before saving…', wide: true },
  ],
  Medication: [
    { label: 'Medication', name: 'medication', required: true, placeholder: 'Medication name' },
    { label: 'Directions', name: 'directions', required: true, placeholder: '1 tablet with food' },
    { label: 'Start date', name: 'startDate', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Schedule time', name: 'time', type: 'time', defaultValue: 'nextHour' },
    { label: 'End date', name: 'endDate', type: 'date' },
    { label: 'For', name: 'person', type: 'select', options: ['Dad', 'Mom', 'Teen', 'Child', 'Family'] },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Prescription label details or instructions…', wide: true },
  ],
  'Health entry': [
    { label: 'Entry type', name: 'entryType', type: 'select', options: ['Temperature', 'Symptom', 'Blood pressure', 'Heart rate', 'Weight', 'Doctor note', 'Other'] },
    { label: 'Reading / value', name: 'value', required: true, placeholder: 'e.g. 38.1 °C' },
    { label: 'For', name: 'person', type: 'select', options: ['Dad', 'Mom', 'Teen', 'Child'] },
    { label: 'Date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Time', name: 'time', type: 'time', required: true, defaultValue: 'nextHour' },
    { label: 'Notes', name: 'notes', type: 'textarea', placeholder: 'Symptoms, context, medication taken, hydration, etc.', wide: true },
  ],
  Milestone: [
    { label: 'Milestone', name: 'title', required: true, placeholder: 'First day of school' },
    { label: 'Who', name: 'person', type: 'select', options: personOptions },
    { label: 'Type', name: 'milestoneType', type: 'select', options: ['Birthday', 'First', 'Graduation', 'Anniversary', 'Achievement', 'Memory', 'Other'] },
    { label: 'Date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Memory / notes', name: 'notes', type: 'textarea', placeholder: 'What made this moment special?', wide: true },
  ],
  'Pet record': [
    { label: 'Pet name', name: 'pet', required: true, placeholder: 'Max' },
    { label: 'Record type', name: 'recordType', type: 'select', options: ['Vet appointment', 'Vaccination', 'Medication', 'Grooming', 'Weight', 'Birthday', 'Adoption day', 'Note'] },
    { label: 'Date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Provider / place', name: 'provider', placeholder: 'Optional' },
    { label: 'Details', name: 'notes', type: 'textarea', placeholder: 'Treatment, dosage, result, reminder, etc.', wide: true },
  ],
  'Vehicle update': [
    { label: 'Vehicle', name: 'vehicle', required: true, placeholder: '2015 Volkswagen Jetta TDI' },
    { label: 'Update type', name: 'updateType', type: 'select', options: ['Mileage', 'Service', 'Repair', 'Fuel', 'Insurance', 'Registration', 'Tire change', 'Other'] },
    { label: 'Odometer (km)', name: 'odometer', type: 'number', placeholder: 'Current mileage', min: '0' },
    { label: 'Date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Cost', name: 'cost', type: 'number', placeholder: '0.00', step: '0.01', min: '0' },
    { label: 'Details', name: 'notes', type: 'textarea', placeholder: 'Work completed, parts, shop, next service, etc.', wide: true },
  ],
  'Home maintenance': [
    { label: 'Task', name: 'task', required: true, placeholder: 'Change furnace filter' },
    { label: 'Area', name: 'area', type: 'select', options: ['Whole home', 'HVAC', 'Kitchen', 'Bathroom', 'Exterior', 'Safety', 'Appliance', 'Yard', 'Other'] },
    { label: 'Due / completed date', name: 'date', type: 'date', required: true, defaultValue: 'today' },
    { label: 'Repeat', name: 'repeat', type: 'select', options: ['No repeat', 'Monthly', 'Every 3 months', 'Every 6 months', 'Yearly', 'Custom'] },
    { label: 'Details', name: 'notes', type: 'textarea', placeholder: 'Model, filter size, contractor, parts, notes…', wide: true },
  ],
  Speak: [
    { label: 'Quick capture', name: 'transcript', type: 'textarea', required: true, placeholder: 'Speak or type what you want Family OS to remember…', wide: true },
    { label: 'Save as', name: 'saveAs', type: 'select', options: ['Quick note', 'Reminder', 'Event idea', 'Health note', 'Home note', 'Vehicle note'] },
  ],
};

let installed = false;
let activeHost: HTMLDivElement | null = null;
let activeOverlay: HTMLElement | null = null;
let previousFocus: HTMLElement | null = null;
let motionPromise: Promise<MotionModule | null> | null = null;
let closing = false;
let transitioning = false;

function escapeHtml(value: string) {
  return value.replace(/[&<>'\"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;',
  }[char] ?? char));
}

function todayValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextHourValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function definitionFor(kind: CaptureKind) {
  return captures.find(item => item.kind === kind) ?? captures[0];
}

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

async function animateElement(target: Element | null, keyframes: Record<string, unknown>, options: Record<string, unknown>) {
  if (!target) return;
  const motion = await loadMotion();
  if (motion?.animate) {
    const animation = motion.animate(target, keyframes, options);
    await animation.finished?.catch(() => undefined);
    return;
  }

  const element = target as HTMLElement;
  const duration = (typeof options.duration === 'number' ? options.duration : 0.24) * 1000;
  const opacity = keyframes.opacity;
  const opacityFrames = Array.isArray(opacity) ? opacity : opacity == null ? undefined : [opacity];
  const animation = element.animate(opacityFrames ? { opacity: opacityFrames as number[] } : [{ opacity: 1 }, { opacity: 1 }], {
    duration,
    easing: 'cubic-bezier(.22,1,.36,1)',
    fill: 'forwards',
  });
  await animation.finished.catch(() => undefined);
}

function fieldValue(field: FieldDefinition) {
  if (field.defaultValue === 'today') return todayValue();
  if (field.defaultValue === 'nextHour') return nextHourValue();
  return '';
}

function renderField(field: FieldDefinition) {
  const type = field.type ?? 'text';
  const classes = ['capture-field'];
  if (field.wide || type === 'textarea' || type === 'file') classes.push('capture-field-wide');
  if (type === 'file') classes.push('capture-file');
  const wrapper = `${classes.join(' ')}\" data-capture-field=\"${escapeHtml(field.name)}`;
  const required = field.required ? ' required' : '';
  const value = fieldValue(field);

  if (type === 'select') {
    return `<label class=\"${wrapper}\"><span>${escapeHtml(field.label)}</span><select name=\"${escapeHtml(field.name)}\"${required}>${(field.options ?? []).map(option => `<option value=\"${escapeHtml(option)}\">${escapeHtml(option)}</option>`).join('')}</select></label>`;
  }
  if (type === 'textarea') {
    return `<label class=\"${wrapper}\"><span>${escapeHtml(field.label)}</span><textarea name=\"${escapeHtml(field.name)}\" rows=\"4\"${required}${field.placeholder ? ` placeholder=\"${escapeHtml(field.placeholder)}\"` : ''}></textarea></label>`;
  }
  if (type === 'file') {
    return `<label class=\"${wrapper}\"><span>${escapeHtml(field.label)}</span><input name=\"${escapeHtml(field.name)}\" type=\"file\" accept=\"image/*,application/pdf\"><small>The file stays on this device; only its name and confirmed record details are stored for now.</small></label>`;
  }

  return `<label class=\"${wrapper}\"><span>${escapeHtml(field.label)}</span><input name=\"${escapeHtml(field.name)}\" type=\"${type}\"${required}${field.placeholder ? ` placeholder=\"${escapeHtml(field.placeholder)}\"` : ''}${value ? ` value=\"${escapeHtml(value)}\"` : ''}${field.step ? ` step=\"${field.step}\"` : ''}${field.min ? ` min=\"${field.min}\"` : ''}></label>`;
}

function renderSavedRecords() {
  const records = loadCaptureRecords();
  if (!records.length) return '';
  return `<section class=\"capture-local-records\">
    <div class=\"capture-local-head\"><div><span class=\"eyebrow\">Saved locally</span><strong>${records.length} record${records.length === 1 ? '' : 's'}</strong></div><small>Recent records · remove anything you no longer need</small></div>
    <div class=\"capture-local-list\">${records.slice(0, 8).map(record => {
      const definition = definitionFor(record.kind);
      return `<article class=\"capture-local-row\" data-capture-record=\"${escapeHtml(record.id)}\" style=\"--capture-accent:${definition.accent}\">
        <span class=\"capture-local-icon\">${definition.icon}</span>
        <div><strong>${escapeHtml(captureRecordSummary(record))}</strong><small>${escapeHtml(record.kind)} · ${escapeHtml(captureRecordDateLabel(record))}</small></div>
        <button type=\"button\" data-capture-delete=\"${escapeHtml(record.id)}\">Remove</button>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function renderSelection(stage: HTMLElement) {
  stage.dataset.captureView = 'menu';
  stage.innerHTML = `<div class=\"capture-view capture-view-menu\">
    <header class=\"capture-pro-header\">
      <div><span class=\"eyebrow\">Universal capture</span><h2>What would you like to add?</h2><p>Choose a record type. Family OS validates it, saves it locally, and updates the relevant views immediately.</p></div>
      <button type=\"button\" class=\"capture-icon-button\" data-capture-close aria-label=\"Close\">×</button>
    </header>
    <div class=\"capture-option-grid\">${captures.map(item => `<button type=\"button\" class=\"capture-option\" data-capture-kind=\"${item.kind}\" style=\"--capture-accent:${item.accent}\"><span class=\"capture-option-icon\">${item.icon}</span><span><strong>${item.kind}</strong><small>${item.description}</small></span><b aria-hidden=\"true\">›</b></button>`).join('')}</div>
    ${renderSavedRecords()}
    <footer class=\"capture-pro-footer\"><span>🔐 Local browser storage</span><span>Ready for future Google Calendar / cloud adapters</span></footer>
  </div>`;
}

function renderForm(stage: HTMLElement, kind: CaptureKind) {
  const item = definitionFor(kind);
  stage.dataset.captureView = 'form';
  const dictation = kind === 'Speak'
    ? `<div class=\"capture-dictation capture-field-wide\"><button type=\"button\" class=\"capture-dictate\" data-capture-dictate>🎙 Start dictation</button><small>Uses browser speech recognition when available. You can always type instead.</small></div>`
    : '';
  stage.innerHTML = `<div class=\"capture-view capture-view-form\" style=\"--capture-accent:${item.accent}\">
    <header class=\"capture-pro-header capture-form-header\">
      <button type=\"button\" class=\"capture-icon-button capture-back\" data-capture-back aria-label=\"Back\">‹</button>
      <div class=\"capture-form-heading\"><span class=\"capture-form-icon\">${item.icon}</span><div><span class=\"eyebrow\">Add record</span><h2>${item.kind}</h2><p>${item.description}</p></div></div>
      <button type=\"button\" class=\"capture-icon-button\" data-capture-close aria-label=\"Close\">×</button>
    </header>
    <form class=\"capture-form\" data-capture-form data-capture-form-kind=\"${item.kind}\" novalidate>
      <div class=\"capture-validation-summary\" data-capture-validation hidden></div>
      ${dictation}
      <div class=\"capture-form-grid\">${schemas[kind].map(renderField).join('')}</div>
      <div class=\"capture-form-actions\"><button type=\"button\" class=\"capture-secondary\" data-capture-back>Back</button><button type=\"submit\" class=\"capture-save\">Save ${item.kind}</button></div>
    </form>
  </div>`;
}

function renderSuccess(stage: HTMLElement, kind: CaptureKind) {
  const item = definitionFor(kind);
  stage.dataset.captureView = 'success';
  stage.innerHTML = `<div class=\"capture-view capture-success\" style=\"--capture-accent:${item.accent}\"><div class=\"capture-success-mark\">✓</div><span class=\"eyebrow\">Saved locally</span><h2>${item.kind} added</h2><p>The record is validated, persisted in this browser, and available to Family OS immediately.</p><div><button type=\"button\" class=\"capture-secondary\" data-capture-add-another>Add another</button><button type=\"button\" class=\"capture-save\" data-capture-close>Done</button></div></div>`;
}

function formValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) values[key] = value instanceof File ? value.name : String(value);
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

  for (const [fieldName, message] of entries) {
    const container = form.querySelector<HTMLElement>(`[data-capture-field=\"${CSS.escape(fieldName)}\"]`);
    container?.classList.add('capture-field-invalid');
    if (container) container.insertAdjacentHTML('beforeend', `<small class=\"capture-field-error\">${escapeHtml(message)}</small>`);
  }

  const firstName = entries[0]?.[0];
  if (firstName) form.querySelector<HTMLElement>(`[name=\"${CSS.escape(firstName)}\"]`)?.focus({ preventScroll: true });
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
    await animateElement(stage, { opacity: [1, 0], x: [0, -34 * direction] }, { duration: 0.16, ease: [0.4, 0, 1, 1] });
    render();
    stage.scrollTop = 0;
    stage.style.opacity = '0';
    stage.style.transform = `translateX(${38 * direction}px)`;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await animateElement(stage, { opacity: [0, 1], x: [38 * direction, 0] }, { duration: 0.3, ease: [0.22, 1, 0.36, 1] });
    clearStageAnimationStyles(stage);
    stage.scrollTop = 0;
  } finally {
    transitioning = false;
  }
}

function setupDictation(stage: HTMLElement) {
  const button = stage.querySelector<HTMLButtonElement>('[data-capture-dictate]');
  const textarea = stage.querySelector<HTMLTextAreaElement>('textarea[name=\"transcript\"]');
  if (!button || !textarea) return;
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
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
  void animateElement(activeHost.querySelector('.capture-pro'), { opacity: [1, 0], scale: [1, 0.975], y: [0, 14] }, { duration: 0.2 });
  void animateElement(activeOverlay, { opacity: [1, 0] }, { duration: 0.22 });
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

    if (target.closest('[data-capture-close]')) {
      void closeCapture();
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>('[data-capture-delete]');
    if (deleteButton?.dataset.captureDelete) {
      const id = deleteButton.dataset.captureDelete;
      if (!window.confirm('Remove this local Family OS record?')) return;
      const row = deleteButton.closest<HTMLElement>('[data-capture-record]');
      void animateElement(row, { opacity: [1, 0] }, { duration: 0.18 }).then(() => {
        removeCaptureRecord(id);
        renderSelection(stage);
      });
      return;
    }

    if (target.closest('[data-capture-back], [data-capture-add-another]')) {
      void transitionStage(stage, () => renderSelection(stage), -1);
      return;
    }

    const option = target.closest<HTMLButtonElement>('.capture-option[data-capture-kind]');
    if (!option?.dataset.captureKind) return;
    const kind = option.dataset.captureKind as CaptureKind;
    void transitionStage(stage, () => {
      renderForm(stage, kind);
      setupDictation(stage);
    }, 1);
  });

  stage.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.closest<HTMLElement>('[data-capture-field]');
    field?.classList.remove('capture-field-invalid');
    field?.querySelector('.capture-field-error')?.remove();
  });

  stage.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-capture-form]')) return;
    event.preventDefault();
    const kind = form.dataset.captureFormKind as CaptureKind | undefined;
    if (!kind) return;
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
  const focusable = Array.from(activeHost.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])'));
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
  host.innerHTML = `<section class=\"capture-pro\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Universal capture\"><div class=\"capture-pro-stage\"></div></section>`;
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
    void animateElement(overlay, { opacity: [0, 1] }, { duration: 0.22 });
    void animateElement(modal, { opacity: [0, 1], scale: [0.965, 1], y: [22, 0] }, { duration: 0.38 });
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
