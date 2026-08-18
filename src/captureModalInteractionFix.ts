let installed = false;

const formKinds = new WeakMap<HTMLFormElement, string>();
const boundForms = new WeakSet<HTMLFormElement>();

function bindForm(form: HTMLFormElement) {
  if (boundForms.has(form)) return;

  const kind = form.getAttribute('data-capture-kind');
  if (!kind) return;

  boundForms.add(form);
  formKinds.set(form, kind);

  // The capture controller's menu router uses closest('[data-capture-kind]').
  // A form previously carried that same attribute, so *every click anywhere
  // inside the form* could look like another record-type selection and replay
  // the slide animation. Keep the record kind out of the click DOM entirely.
  form.removeAttribute('data-capture-kind');

  // The controller still needs the kind when its delegated submit handler runs.
  // Restore it only for the lifetime of the submit event, then remove it again
  // after propagation completes. Click/focus events never see this attribute.
  form.addEventListener('submit', () => {
    const storedKind = formKinds.get(form);
    if (!storedKind) return;

    form.setAttribute('data-capture-kind', storedKind);
    queueMicrotask(() => {
      if (form.isConnected) form.removeAttribute('data-capture-kind');
    });
  });
}

function bindCurrentForms(root: ParentNode = document) {
  if (root instanceof HTMLFormElement && root.matches('form[data-capture-form][data-capture-kind]')) {
    bindForm(root);
  }

  root.querySelectorAll<HTMLFormElement>('form[data-capture-form][data-capture-kind]').forEach(bindForm);
}

/**
 * Keeps record-type metadata off interactive capture forms so field clicks,
 * labels, selects, date pickers and text areas can never be interpreted as
 * menu navigation. The kind is exposed only while the form submit event is
 * propagating, preserving validation/save behavior in the existing controller.
 */
export function installCaptureModalInteractionFix() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  bindCurrentForms();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        bindCurrentForms(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
