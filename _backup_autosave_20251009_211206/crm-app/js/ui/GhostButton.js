export function createGhostButton(options = {}) {
  const opts = options || {};
  const button = document.createElement('button');
  button.type = opts.type || 'button';
  button.className = 'btn ghost secondary-action';
  button.textContent = opts.label || '';

  if (opts.id) button.id = opts.id;
  if (opts.value != null) button.value = opts.value;
  if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);
  if (opts.title) button.title = opts.title;
  applyDataset(button, opts.dataset);

  if (opts.icon) {
    applyIcon(button, opts.icon, opts.label || '');
  }

  return button;
}

function applyDataset(target, dataset) {
  if (!target || !dataset) return;
  Object.keys(dataset).forEach((key) => {
    target.dataset[key] = dataset[key];
  });
}

function applyIcon(button, icon, label) {
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
