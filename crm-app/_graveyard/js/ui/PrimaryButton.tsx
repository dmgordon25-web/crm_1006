export interface ButtonOptions {
  label: string;
  id?: string;
  type?: 'button' | 'submit' | 'reset';
  value?: string;
  icon?: string;
  ariaLabel?: string;
  title?: string;
  dataset?: Record<string, string>;
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

export function createPrimaryButton(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = options.type || 'button';
  button.className = 'btn brand primary-action';
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
