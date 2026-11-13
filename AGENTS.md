# Development

Keep calendar UI, event loading, localization, and personal events in the Vencord plugin package. Keep browser APIs and browser packaging in the Chrome extension package.

Run `pnpm test` for the shared plugin tests and `pnpm build` for the Chrome bundle. Use `pnpm build --dev` for a Vencord development build. The extension path used by Chrome is `dist/chromium-unpacked`.
