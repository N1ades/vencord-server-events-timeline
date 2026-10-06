# Contributing

Use Node.js 22 or newer. Install development dependencies with `npm ci`.

```sh
npm test
npm run preview
```

The preview runs at http://127.0.0.1:8767 and contains only synthetic events. It shares the real timeline component and styles with the plugin, but mocks Discord's event actions and stores.

## Testing in Vencord

Clone this repository directly into `src/userplugins/serverEventsTimeline` in a Vencord source checkout. Install Vencord's dependencies using the package manager specified in its `package.json`, then run these commands from the Vencord root:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/userplugins/serverEventsTimeline/*.ts src/userplugins/serverEventsTimeline/*.tsx
node scripts/build/build.mjs --disable-updater
node scripts/build/buildWeb.mjs --skip-extension
```

Restart Discord with the custom build installed. Check overlapping events, midnight boundaries, long events scrolling off the left edge, empty dates, recurring occurrences, and language changes. Native Discord integrations cannot be fully validated by the browser preview.

## Code layout

| File | Responsibility |
| --- | --- |
| `index.tsx` | Vencord registration, Discord stores, fetching, and native event dialogs |
| `Timeline.tsx` | Timeline, list, filters, navigation, and event details |
| `core.ts` | Occurrence expansion, lane packing, and calendar windows |
| `loader.ts` | Sequential fetch queue, cache, cancellation, and progress |
| `i18n.ts` | Translation strings, locale mapping, and plural forms |
| `settings.ts` | Saved preferences and plugin settings |
| `style.css` | Layout and theme |
| `scripts/` | Standalone tests and synthetic browser preview |

Keep user-facing messages in `i18n.ts`. Add every key and interpolation placeholder to all five languages. Event titles and descriptions must remain in the organizer's original language. Add focused tests when changing recurrence expansion, queue behavior, navigation, or language resolution.

Keep changes small, explain the resulting behavior, and include the checks you ran. Preserve existing copyright notices and the GPL-3.0-or-later license.
