# Server Events Timeline

A shared calendar for scheduled Discord server events and saved message timestamps.

- `packages/vencord-plugin` contains the timeline, event loading, recurrence, localization, and personal calendar. Use it as a Vencord user plugin or run its standalone preview.
- `packages/chrome-extension` contains the browser toolbar integration and build script. It bundles the workspace plugin with a pinned Vencord Web checkout.

Use Node.js 22 or newer, pnpm, and Git.

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The first Chrome build fetches Vencord into `.build/vencord` and installs its locked dependencies. Build output goes to `dist/chromium-unpacked`. Select that folder with **Load unpacked** in Chrome or Edge, or click **Reload** on the existing extension after rebuilding. Reload Discord and left-click the toolbar icon to open the calendar.

Use `pnpm preview` to work on the shared timeline against synthetic data. For desktop setup, see the [Vencord plugin instructions](packages/vencord-plugin/README.md).

## Shared calendar and publication

The public calendar runs on [tl.nyades.dev](https://tl.nyades.dev/). See the [service and GET API](packages/timeline-service/README.md) and the [Grok Automation prompt](GROK-AUTOMATION.md).
