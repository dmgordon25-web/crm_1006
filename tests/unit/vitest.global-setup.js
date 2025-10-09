/**
 * Legacy Vitest global setup stub retained so Vitest's configuration can resolve the
 * module while the legacy unit tests remain quarantined. Vitest expects a default export
 * from this file, therefore we provide a minimal async function that performs no work.
 */
export default async function legacyGlobalSetupStub() {
  // Intentionally empty.
}
