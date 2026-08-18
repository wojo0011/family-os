let installed = false;
const guarded = new WeakSet<EventTarget>();

function guardControl(element: Element) {
  if (guarded.has(element)) return;
  guarded.add(element);

  // Let the control receive its click and perform its native default action
  // (focus, date/time picker, select menu, file picker, etc.), but do not let
  // that click bubble back to the capture modal's delegated navigation router.
  element.addEventListener('click', event => {
    event.stopPropagation();
  });
}

function guardCurrentControls(root: ParentNode = document) {
  root.querySelectorAll(
    '.capture-pro-stage form[data-capture-form] input, ' +
    '.capture-pro-stage form[data-capture-form] textarea, ' +
    '.capture-pro-stage form[data-capture-form] select, ' +
    '.capture-pro-stage form[data-capture-form] label'
  ).forEach(guardControl);
}

/**
 * Capture forms are rendered dynamically inside the modal. The modal controller
 * uses a delegated click listener for menu navigation, so form controls must
 * stop their clicks at the control itself. This preserves native input behavior
 * while guaranteeing a form-field click can never be interpreted as another
 * "open this record type" navigation action.
 */
export function installCaptureModalInteractionFix() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  guardCurrentControls();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('input, textarea, select, label') && node.closest('form[data-capture-form]')) {
          guardControl(node);
        }
        guardCurrentControls(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
