(function () {
  if (window.__WIRED_CAL_ICS__) return;
  window.__WIRED_CAL_ICS__ = true;

  function run() {
    const view = document.getElementById('view-calendar') || document.querySelector('[data-view="calendar"]');
    if (!view) return;
    if (view.querySelector('[data-ics-export]')) return;

    const button = document.createElement('button');
    button.textContent = 'Export .ics';
    button.setAttribute('data-ics-export', '1');
    button.addEventListener('click', () => {
      try {
        if (typeof window.exportToIcalFile === 'function') {
          window.exportToIcalFile();
        } else if (typeof window.exportCustomEventsToIcs === 'function') {
          window.exportCustomEventsToIcs();
        }
      } catch (error) {
        console.warn(error);
      }
    });

    (view.querySelector('header') || view).appendChild(button);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  window.RenderGuard?.registerHook?.(run);
})();
