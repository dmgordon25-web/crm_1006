# Testing & Tooling

## Continuous Integration
- Run all unit tests (same command used by CI):
  - `npm run ci`
- Run the focused unit suite locally with config output:
  - `npm run test:unit`

## Optional smoke test
- Chromium smoke flow (not part of CI):
  - `npm run e2e:smoke`

## Static sweep
- Generate orphan/dup listener report and refresh `reports/orphan_report.*`:
  - `npm run sweep`
- Pre-commit guard (strict mode, also wired to `npm run precommit`):
  - `npm run sweep -- --strict`

## Cleaning up a stuck server
- Windows (PowerShell): `Get-Process -Name python,py,node | Stop-Process -Force`
- macOS/Linux: `lsof -ti:8080 | xargs kill -9`
- The launchers (`Start-CRM.bat` / `Start-CRM.command`) now stop their helper servers automatically when the shell exits, but the commands above will free port 8080 if a process is left behind.
