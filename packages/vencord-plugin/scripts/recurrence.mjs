import rrule from "rrule/dist/es5/rrule.js";

const { RRule, Weekday } = rrule;

/** Mirror Discord's native camelCase rule converter for tests and the preview. */
export function recurrenceDates(rule, from, to) {
    const start = new Date(rule.start);
    start.setMilliseconds(0);
    return new RRule({
        dtstart: start,
        until: rule.end == null ? null : new Date(rule.end),
        freq: rule.frequency,
        interval: rule.interval,
        byweekday: rule.byWeekday ?? rule.byNWeekday?.map(({ day, n }) => new Weekday(day, n)),
        bymonth: rule.byMonth,
        bymonthday: rule.byMonthDay,
        byyearday: rule.byYearDay,
        count: rule.count
    }).between(from, to, true, (_, index) => index < 1000);
}
