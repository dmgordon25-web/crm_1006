export default async function ensureStdoutColumns() {
  if (!process.stdout) {
    return;
  }

  const columns = process.stdout.columns;
  if (typeof columns !== 'number' || !Number.isFinite(columns)) {
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

  const { Writable } = await import('node:stream');
  if (Writable?.prototype && !('columns' in Writable.prototype)) {
    Object.defineProperty(Writable.prototype, 'columns', {
      configurable: true,
      enumerable: false,
      get() {
        return 80;
      },
      set() {
        // ignore assignments
      }
    });
  }
}
