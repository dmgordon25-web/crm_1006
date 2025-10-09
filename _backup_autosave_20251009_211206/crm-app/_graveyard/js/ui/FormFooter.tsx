import { createGhostButton } from './GhostButton.tsx';
import { createPrimaryButton } from './PrimaryButton.tsx';

export interface FormFooterOptions {
  host?: HTMLElement | null;
  form?: HTMLFormElement | null;
  saveLabel?: string;
  cancelLabel?: string;
  saveId?: string;
  cancelId?: string;
  saveType?: 'button' | 'submit' | 'reset';
  cancelType?: 'button' | 'submit' | 'reset';
  saveValue?: string;
  cancelValue?: string;
  onSave?: (event: Event) => void;
  onCancel?: (event: Event) => void;
}

export interface FormFooterHandle {
  element: HTMLElement;
  saveButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  destroy: () => void;
}

function isTextArea(target: EventTarget | null): target is HTMLTextAreaElement {
  if(!target) return false;
  const tag = (target as Element).tagName;
  return typeof tag === 'string' && tag.toLowerCase() === 'textarea';
}

function clearHost(host: HTMLElement): void {
  while(host.firstChild){
    host.removeChild(host.firstChild);
  }
}

export function createFormFooter(options: FormFooterOptions = {}): FormFooterHandle {
  const host = options.host || document.createElement('div');
  if(!options.host){
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
    id: options.cancelId,
    label: options.cancelLabel || 'Cancel',
    type: options.cancelType || 'button',
    value: options.cancelValue
  });
  cancelButton.dataset.role = 'cancel';

  const saveButton = createPrimaryButton({
    id: options.saveId,
    label: options.saveLabel || 'Save',
    type: options.saveType || 'button',
    value: options.saveValue
  });
  saveButton.dataset.role = 'save';

  start.appendChild(cancelButton);
  end.appendChild(saveButton);

  host.appendChild(start);
  host.appendChild(end);

  const form = options.form || host.closest('form');
  const listeners: Array<() => void> = [];

  if(options.onCancel){
    const onCancel = (event: Event)=>{
      options.onCancel?.(event);
    };
    cancelButton.addEventListener('click', onCancel);
    listeners.push(()=> cancelButton.removeEventListener('click', onCancel));
  }

  if(options.onSave){
    const onSave = (event: Event)=>{
      options.onSave?.(event);
    };
    saveButton.addEventListener('click', onSave);
    listeners.push(()=> saveButton.removeEventListener('click', onSave));
  }

  if(form){
    const keyHandler = (event: KeyboardEvent)=>{
      if(event.defaultPrevented) return;
      if(event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey){
        const target = event.target as HTMLElement | null;
        if(isTextArea(target)) return;
        event.preventDefault();
        saveButton.click();
        return;
      }
      if(event.key === 'Escape'){
        event.preventDefault();
        cancelButton.click();
      }
    };
    form.addEventListener('keydown', keyHandler);
    listeners.push(()=> form.removeEventListener('keydown', keyHandler));
  }

  const destroy = ()=>{
    listeners.forEach(fn => fn());
  };

  return { element: host, saveButton, cancelButton, destroy };
}
