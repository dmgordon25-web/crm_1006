import { createGhostButton } from './GhostButton.js';
import { createPrimaryButton } from './PrimaryButton.js';

function isTextArea(target) {
  if (!target) return false;
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) {
    return true;
  }
  const tag = target.tagName;
  return typeof tag === 'string' && tag.toLowerCase() === 'textarea';
}

function clearHost(host) {
  if (!host) return;
  while (host.firstChild) {
    host.removeChild(host.firstChild);
  }
}

export function createFormFooter(options = {}) {
  const opts = options || {};
  const host = opts.host || document.createElement('div');
  if (!opts.host) {
    host.classList.add('modal-footer');
  }
  host.classList.add('form-footer');
  host.setAttribute('data-component', 'form-footer');

  clearHost(host);

  const start = document.createElement('div');
  start.className = 'form-footer__start';
  const end = document.createElement('div');
  end.className = 'form-footer__end';

  const cancelButton = createGhostButton({
    id: opts.cancelId,
    label: opts.cancelLabel || 'Cancel',
    type: opts.cancelType || 'button',
    value: opts.cancelValue
  });
  cancelButton.dataset.role = 'cancel';

  const saveButton = createPrimaryButton({
    id: opts.saveId,
    label: opts.saveLabel || 'Save',
    type: opts.saveType || 'button',
    value: opts.saveValue
  });
  saveButton.dataset.role = 'save';

  start.appendChild(cancelButton);
  end.appendChild(saveButton);

  host.appendChild(start);
  host.appendChild(end);

  const form = opts.form || host.closest('form');
  const listeners = [];

  if (typeof opts.onCancel === 'function') {
    const onCancel = (event) => {
      opts.onCancel(event);
    };
    cancelButton.addEventListener('click', onCancel);
    listeners.push(() => cancelButton.removeEventListener('click', onCancel));
  }

  if (typeof opts.onSave === 'function') {
    const onSave = (event) => {
      opts.onSave(event);
    };
    saveButton.addEventListener('click', onSave);
    listeners.push(() => saveButton.removeEventListener('click', onSave));
  }

  if (form) {
    const keyHandler = (event) => {
      if (!event || event.defaultPrevented) return;
      const key = event.key;
      if (key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target;
        if (isTextArea(target)) return;
        event.preventDefault();
        saveButton.click();
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        cancelButton.click();
      }
    };
    form.addEventListener('keydown', keyHandler);
    listeners.push(() => form.removeEventListener('keydown', keyHandler));
  }

  const destroy = () => {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (_err) {
        /* noop */
      }
    });
  };

  return { element: host, saveButton, cancelButton, destroy };
}
