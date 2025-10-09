if (process.stdout && (!Number.isFinite(process.stdout.columns) || process.stdout.columns === undefined)) {
  try {
    process.stdout.columns = 80;
  } catch (error) {
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      configurable: true,
      writable: true
    });
  }
}

const originalRepeat = String.prototype.repeat;
if (!originalRepeat.__vitestPatched) {
  const patched = function patchedRepeat(count) {
    if (!Number.isFinite(count)) {
      count = 0;
    }
    return originalRepeat.call(this, count);
  };
  Object.defineProperty(patched, '__vitestPatched', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
  String.prototype.repeat = patched;
}
