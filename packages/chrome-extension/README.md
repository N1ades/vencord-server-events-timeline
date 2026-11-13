# Chrome extension

In the repository root, run `pnpm install --frozen-lockfile` and `pnpm build`.

1. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the repository's `dist/chromium-unpacked` directory.
3. Reload Discord and left-click the extension icon. The extension opens your existing Discord tab or starts a new one. Sign in to see your servers.
4. After a rebuild, click **Reload** on the extension card and refresh Discord again.

The calendar button in Discord and the `/events-timeline` command also work. Use one Vencord Web extension per browser profile. This build uses the upstream Vencord Web rule that removes Discord's Content Security Policy headers for its client patches.

The browser bundle uses the sibling `vencord-plugin` workspace package. The build script pins the [Vencord Web source](https://github.com/Vendicated/Vencord/tree/d07030c0968e31e41caa0c35fda0ef8ae63a079e). Vencord and the plugin are licensed under GPL-3.0-or-later.

## Publish to the shared timeline

Open the calendar in Discord and choose **Publishing** to set the Discord write key and select servers. **Select all** includes servers joined later. Open or refresh the calendar to collect and publish scheduled events. The introduction of a public feed makes published titles, descriptions, source links, and server names visible to visitors. The extension leaves saved message timestamps and restricted channels local.

The calendar loads directly from Discord. Publication uses a separate local queue and retries transient failures while Chrome is running. Repeated Discord events use a stable ID for each occurrence. Current publication runs when the Discord calendar is refreshed, including its regular refresh while open, with a window from 7 days ago through 90 days ahead.
