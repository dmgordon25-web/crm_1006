import type { ButtonOptions } from './PrimaryButton.tsx';

export interface GhostButtonOptions extends ButtonOptions {
  subtle?: boolean;
}

function applyDataset(target: HTMLElement, dataset?: Record<string, string>): void {
  if(!dataset) return;
  Object.keys(dataset).forEach(key => {
    target.dataset[key] = dataset[key];
  });
}

function applyIcon(button: HTMLButtonElement, icon: string, label: string): void {
  const iconSpan = document.createElement('span');
  iconSpan.className = 'btn-icon';
  iconSpan.textContent = icon;

  const labelSpan = document.createElement('span');
  labelSpan.className = 'btn-label';
  labelSpan.textContent = label;

  button.textContent = '';
  button.appendChild(iconSpan);
  button.appendChild(labelSpan);
}

export function createGhostButton(options: GhostButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = options.type || 'button';
  button.className = 'btn ghost secondary-action';
  button.textContent = options.label;

  if(options.id) button.id = options.id;
  if(options.value != null) button.value = options.value;
  if(options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
  if(options.title) button.title = options.title;
  applyDataset(button, options.dataset);

  if(options.icon){
    applyIcon(button, options.icon, options.label);
  }

  return button;
}
