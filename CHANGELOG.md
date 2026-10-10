# Changelog

## 1.1.0

- Save rendered Discord message timestamps as personal calendar events from the message context menu, including individual choices for messages with multiple timestamps.
- Show a calendar badge beside saved timestamps. Clicking it selects the event, jumps to its time, and clears filters that would hide it.
- Default saved timestamps to one hour, with a configurable default in the calendar toolbar and per-event duration editing in the details panel.
- Remove personal entries from the details panel and return to their source messages.
- Persist personal entries locally and keep separate collections for each Discord account.
- Translate the new controls into all five supported languages and add persistence, duration, and timestamp parsing tests.

## 1.0.2

- Click the server name in the event details panel to close the timeline and navigate to the server.
- Drag the timeline with the left mouse button, including from event blocks. Dragging suppresses accidental event clicks and continues across infinite scrolling window shifts.
- Translate the server link tooltip into all five supported languages.

## 1.0.1

- Normalize Discord's API recurrence fields before expanding events. Weekday, nth-weekday, month, month-day, and year-day constraints now reach Discord's recurrence engine correctly.
- Add regression tests using a real RRULE engine and three recurring events to the standalone preview.

## 1.0.0

Initial public release.

- Collect scheduled events from all joined Discord servers.
- Pack events into compact shared lanes with server icons and names.
- Scroll horizontally through past and future dates with a bounded rendering window.
- Keep event labels pinned to the visible left edge until the event ends.
- Display local weekdays, weekend highlights, and a current-time indicator.
- Return to the current time from any date or the list view.
- Search events and filter servers or active events.
- Support recurring events, cancellations, and rescheduled occurrences.
- Follow Discord's language by default, with English, Russian, Japanese, Spanish, and Korean translations.
- Refresh events automatically while the timeline is open.
