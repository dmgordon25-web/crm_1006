export function debounce(fn, wait = 150) {
  let timer = null;
  return function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}

export function doubleRaf(callback) {
  const run = typeof callback === 'function' ? callback : () => {};
  const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : null;
  if (raf) {
    raf(() => raf(run));
    return;
  }
  setTimeout(run, 32);
}
