(function ensureTtyDefaults() {
  const stdout = process.stdout;
  if (stdout && (!Number.isFinite(stdout.columns) || stdout.columns === undefined)) {
    try {
      stdout.columns = 80;
    } catch (error) {
      Object.defineProperty(stdout, 'columns', {
        value: 80,
        configurable: true,
        writable: true
      });
    }
  }

  const stderr = process.stderr;
  if (stderr && (!Number.isFinite(stderr.columns) || stderr.columns === undefined)) {
    try {
      stderr.columns = 80;
    } catch (error) {
      Object.defineProperty(stderr, 'columns', {
        value: 80,
        configurable: true,
        writable: true
      });
    }
  }

  try {
    const { Writable } = require('node:stream');
    if (Writable && Writable.prototype && !Object.prototype.hasOwnProperty.call(Writable.prototype, 'columns')) {
      Object.defineProperty(Writable.prototype, 'columns', {
        configurable: true,
        enumerable: false,
        get() {
          return 80;
        },
        set() {
          // ignore assignments from downstream libraries
        }
      });
    }
  } catch (error) {
    // ignore
  }

  const originalRepeat = String.prototype.repeat;
  if (typeof originalRepeat === 'function' && !originalRepeat.__ciPatched) {
    const patched = function patchedRepeat(count) {
      if (!Number.isFinite(count)) {
        count = 0;
      }
      return originalRepeat.call(this, count);
    };
    Object.defineProperty(patched, '__ciPatched', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    String.prototype.repeat = patched;
  }
})();
