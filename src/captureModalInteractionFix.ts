let installed = false;

type PendingKind = {
  form: HTMLFormElement;
  kind: string;
};

const pendingKinds = new WeakMap<Event, PendingKind>();

/**
 * The capture controller uses data-capture-kind on both the menu option and
 * the active form. Its delegated click router intentionally looks upward with
 * closest(), so a click on an input could otherwise resolve to the form and be
 * mistaken for a menu-option click.
 *
 * Keep the form's kind available for submit/validation, but hide that marker
 * only while a click travels through the delegated click handler. It is
 * restored at document-bubble time before the browser performs the button's
 * default action (including form submission).
 */
export function installCaptureModalInteractionFix() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Actual record-type menu buttons must continue through the normal router.
    if (target.closest('.capture-option[data-capture-kind]')) return;

    const form = target.closest<HTMLFormElement>('form[data-capture-form][data-capture-kind]');
    if (!form) return;

    const kind = form.getAttribute('data-capture-kind');
    if (!kind) return;

    pendingKinds.set(event, { form, kind });
    form.removeAttribute('data-capture-kind');
  }, true);

  document.addEventListener('click', event => {
    const pending = pendingKinds.get(event);
    if (!pending) return;

    if (pending.form.isConnected) {
      pending.form.setAttribute('data-capture-kind', pending.kind);
    }
    pendingKinds.delete(event);
  });
}
