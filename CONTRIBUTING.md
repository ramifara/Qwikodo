# Contributing to Qwikodo

Thanks for helping make Qwikodo better. The project is intentionally narrow: it reads codes locally
from files, cameras, clipboards, and screens, then keeps a small on-device history.

## Before you start

For a bug fix, open an issue that includes the operating system, Qwikodo version, reproduction
steps, and a sample image when it is safe to share one. For a feature, describe the problem before
building the solution. Features involving accounts, cloud services, analytics, advertising, code
generation, or broad filesystem/network access are outside the project's scope.

Security issues follow the private process in [SECURITY.md](SECURITY.md).

## Local setup

Install the platform prerequisites linked from the README, then run:

```sh
npm ci
rustup component add rustfmt clippy
npm run tauri dev
```

Before opening a pull request:

```sh
npm run build
npm test
npm run check:rust
```

Changes to a native source should be exercised on that operating system when possible. Permission
or capture changes should include the exact OS version and desktop environment used for manual
testing.

## Pull requests

- Keep each commit focused and use an imperative subject, such as `fix: restore the window after a
  failed screen capture`.
- Explain user-visible behavior, privacy or permission changes, and validation performed.
- Update the README or architecture notes when a capability or data flow changes.
- Do not add a runtime dependency when a platform or browser API already solves the problem.
- Never commit private barcodes, credentials, signing certificates, or generated build directories.

By contributing, you agree that your contribution is licensed under the project's MIT License.
