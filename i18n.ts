/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const languages = [
    { value: "ru", label: "Русский", locale: "ru-RU" },
    { value: "en", label: "English", locale: "en-US" },
    { value: "ja", label: "日本語", locale: "ja-JP" },
    { value: "es", label: "Español", locale: "es-ES" },
    { value: "ko", label: "한국어", locale: "ko-KR" }
] as const;
export type Language = typeof languages[number]["value"];

const ru = {
    durationSetting: "Длительность блока, если организатор не указал окончание", durationHours: "{hours} ч.", refreshSetting: "Обновлять все серверы каждые 5 минут, пока таймлайн открыт",
    title: "События серверов", subtitle: "Твоё расписание Discord", refresh: "↻ Обновить", close: "Закрыть таймлайн",
    previous: "Предыдущий период", next: "Следующий период", date: "Дата расписания", returnNow: "Вернуться к текущему времени", now: "◷ Сейчас",
    period: "Период", day: "День", threeDays: "3 дня", week: "Неделя", search: "Поиск событий", searchPlaceholder: "Поиск событий, серверов, мест…",
    servers: "Серверы", hidden: "{count} скрыто", timeline: "Таймлайн", list: "Список", language: "Язык / Language",
    auto: "Язык Discord", all: "Все", clear: "Снять", searchServers: "Поиск серверов", serverPlaceholder: "Найти сервер…", onlyActive: "Только идут сейчас", zoom: "Масштаб", zoomLabel: "Масштаб таймлайна",
    loadingServers: "Загрузка серверов: {done} / {total}", checked: "Проверено в {time}", cached: "События из кеша Discord",
    warning: "Не удалось обновить серверы ({count}): {servers}. Доступные события сохранены; попробуй «Обновить».",
    loading: "Собираем расписание…", empty: "В этом периоде событий нет", emptyHint: "Выбери другую дату или убери фильтры.",
    emptyGrid: "В этих датах событий нет. Прокрути шкалу или убери фильтры.", gridLabel: "Бесконечная шкала событий",
    live: "Идёт сейчас", liveShort: "Сейчас", repeats: "Повторяется", repeatedEvent: "Повторяющееся мероприятие",
    estimateLegend: "≈ Окончание не указано; блок на {hours} ч.", estimated: "окончание приблизительное", until: "до",
    closeDetail: "Закрыть карточку", estimateHint: "Организатор не указал окончание. Длительность блока приблизительная.",
    noDescription: "Описание не добавлено.", openEvent: "Открыть событие в Discord ↗", launcher: "События всех серверов", openTimeline: "Открыть таймлайн событий",
    about: "Компактное расписание всех серверов. Поиск, повторяющиеся события, местное время и фильтры серверов.",
    events_one: "{count} событие", events_few: "{count} события", events_many: "{count} событий", events_other: "{count} событий",
    guilds_one: "{count} сервер", guilds_few: "{count} сервера", guilds_many: "{count} серверов", guilds_other: "{count} серверов"
};
type Messages = typeof ru;
type Key = keyof Messages;

const en: Messages = {
    durationSetting: "Block duration when the organizer does not specify an end", durationHours: "{hours} h", refreshSetting: "Refresh all servers every 5 minutes while the timeline is open",
    title: "Server events", subtitle: "Your Discord schedule", refresh: "↻ Refresh", close: "Close timeline",
    previous: "Previous period", next: "Next period", date: "Schedule date", returnNow: "Return to current time", now: "◷ Now",
    period: "Period", day: "Day", threeDays: "3 days", week: "Week", search: "Search events", searchPlaceholder: "Search events, servers, places…",
    servers: "Servers", hidden: "{count} hidden", timeline: "Timeline", list: "List", language: "Language",
    auto: "Discord language", all: "All", clear: "Clear", searchServers: "Search servers", serverPlaceholder: "Find a server…", onlyActive: "Only happening now", zoom: "Zoom", zoomLabel: "Timeline zoom",
    loadingServers: "Loading servers: {done} / {total}", checked: "Checked at {time}", cached: "Events from Discord cache",
    warning: "Could not refresh servers ({count}): {servers}. Available events were kept; try Refresh.",
    loading: "Gathering events…", empty: "No events in this period", emptyHint: "Choose another date or remove filters.",
    emptyGrid: "No events on these dates. Scroll the timeline or remove filters.", gridLabel: "Infinite event timeline",
    live: "Happening now", liveShort: "Live", repeats: "Repeats", repeatedEvent: "Recurring event",
    estimateLegend: "≈ End unspecified; {hours} h block", estimated: "estimated end", until: "until",
    closeDetail: "Close event details", estimateHint: "The organizer did not specify an end. The block duration is approximate.",
    noDescription: "No description provided.", openEvent: "Open event in Discord ↗", launcher: "Events from all servers", openTimeline: "Open event timeline",
    about: "A compact schedule for all your servers. Search, recurring events, local time and server filters.",
    events_one: "{count} event", events_few: "{count} events", events_many: "{count} events", events_other: "{count} events",
    guilds_one: "{count} server", guilds_few: "{count} servers", guilds_many: "{count} servers", guilds_other: "{count} servers"
};
const ja: Messages = {
    durationSetting: "終了時刻が未設定の場合の表示時間", durationHours: "{hours}時間", refreshSetting: "タイムライン表示中は全サーバーを5分ごとに更新する",
    title: "サーバーイベント", subtitle: "Discordのイベント予定", refresh: "↻ 更新", close: "タイムラインを閉じる",
    previous: "前の期間", next: "次の期間", date: "表示する日付", returnNow: "現在の時刻に戻る", now: "◷ 現在",
    period: "期間", day: "1日", threeDays: "3日間", week: "1週間", search: "イベントを検索", searchPlaceholder: "イベント・サーバー・場所を検索…",
    servers: "サーバー", hidden: "{count}件を非表示", timeline: "タイムライン", list: "リスト", language: "言語",
    auto: "Discordの言語", all: "すべて", clear: "選択解除", searchServers: "サーバーを検索", serverPlaceholder: "サーバーを探す…", onlyActive: "開催中のみ", zoom: "表示倍率", zoomLabel: "タイムラインの表示倍率",
    loadingServers: "サーバーを読み込み中: {done} / {total}", checked: "更新時刻: {time}", cached: "Discordのキャッシュ内のイベント",
    warning: "サーバーを更新できませんでした（{count}件）: {servers}。取得済みのイベントは保持されています。「更新」をお試しください。",
    loading: "イベントを取得中…", empty: "この期間にイベントはありません", emptyHint: "別の日付を選ぶか、フィルターを解除してください。",
    emptyGrid: "この日付にイベントはありません。タイムラインをスクロールするか、フィルターを解除してください。", gridLabel: "無限スクロールのイベントタイムライン",
    live: "開催中", liveShort: "開催中", repeats: "繰り返し", repeatedEvent: "繰り返しイベント",
    estimateLegend: "≈ 終了時刻未設定・{hours}時間の表示", estimated: "終了時刻は目安", until: "終了",
    closeDetail: "イベント詳細を閉じる", estimateHint: "主催者が終了時刻を設定していません。表示される長さは目安です。",
    noDescription: "説明はありません。", openEvent: "Discordでイベントを開く ↗", launcher: "全サーバーのイベント", openTimeline: "イベントタイムラインを開く",
    about: "全サーバーの予定をコンパクトに表示。検索、繰り返しイベント、現地時刻、サーバーフィルターに対応。",
    events_one: "イベント{count}件", events_few: "イベント{count}件", events_many: "イベント{count}件", events_other: "イベント{count}件",
    guilds_one: "サーバー{count}件", guilds_few: "サーバー{count}件", guilds_many: "サーバー{count}件", guilds_other: "サーバー{count}件"
};
const es: Messages = {
    durationSetting: "Duración del bloque cuando el organizador no indica la hora de fin", durationHours: "{hours} h", refreshSetting: "Actualizar todos los servidores cada 5 minutos mientras la cronología esté abierta",
    title: "Eventos de servidores", subtitle: "Tu agenda de Discord", refresh: "↻ Actualizar", close: "Cerrar cronología",
    previous: "Periodo anterior", next: "Periodo siguiente", date: "Fecha de la agenda", returnNow: "Volver a la hora actual", now: "◷ Ahora",
    period: "Periodo", day: "Día", threeDays: "3 días", week: "Semana", search: "Buscar eventos", searchPlaceholder: "Buscar eventos, servidores, lugares…",
    servers: "Servidores", hidden: "{count} ocultos", timeline: "Cronología", list: "Lista", language: "Idioma",
    auto: "Idioma de Discord", all: "Todos", clear: "Desmarcar", searchServers: "Buscar servidores", serverPlaceholder: "Buscar un servidor…", onlyActive: "Solo en curso", zoom: "Escala", zoomLabel: "Escala de la cronología",
    loadingServers: "Cargando servidores: {done} / {total}", checked: "Actualizado a las {time}", cached: "Eventos de la caché de Discord",
    warning: "No se pudieron actualizar los servidores ({count}): {servers}. Se conservaron los eventos disponibles; pulsa Actualizar.",
    loading: "Recopilando eventos…", empty: "No hay eventos en este periodo", emptyHint: "Elige otra fecha o elimina los filtros.",
    emptyGrid: "No hay eventos en estas fechas. Desplaza la cronología o elimina los filtros.", gridLabel: "Cronología infinita de eventos",
    live: "En curso", liveShort: "En curso", repeats: "Se repite", repeatedEvent: "Evento recurrente",
    estimateLegend: "≈ Sin hora de fin; bloque de {hours} h", estimated: "fin aproximado", until: "hasta",
    closeDetail: "Cerrar detalles del evento", estimateHint: "El organizador no indicó la hora de fin. La duración del bloque es aproximada.",
    noDescription: "Sin descripción.", openEvent: "Abrir evento en Discord ↗", launcher: "Eventos de todos los servidores", openTimeline: "Abrir cronología de eventos",
    about: "Una agenda compacta de todos tus servidores. Búsqueda, eventos recurrentes, hora local y filtros de servidores.",
    events_one: "{count} evento", events_few: "{count} eventos", events_many: "{count} eventos", events_other: "{count} eventos",
    guilds_one: "{count} servidor", guilds_few: "{count} servidores", guilds_many: "{count} servidores", guilds_other: "{count} servidores"
};
const ko: Messages = {
    durationSetting: "주최자가 종료 시간을 지정하지 않은 경우의 표시 시간", durationHours: "{hours}시간", refreshSetting: "타임라인이 열려 있는 동안 5분마다 모든 서버 새로 고침",
    title: "서버 이벤트", subtitle: "내 Discord 일정", refresh: "↻ 새로 고침", close: "타임라인 닫기",
    previous: "이전 기간", next: "다음 기간", date: "일정 날짜", returnNow: "현재 시간으로 돌아가기", now: "◷ 지금",
    period: "기간", day: "하루", threeDays: "3일", week: "일주일", search: "이벤트 검색", searchPlaceholder: "이벤트, 서버, 장소 검색…",
    servers: "서버", hidden: "{count}개 숨김", timeline: "타임라인", list: "목록", language: "언어",
    auto: "Discord 언어", all: "모두", clear: "선택 해제", searchServers: "서버 검색", serverPlaceholder: "서버 찾기…", onlyActive: "진행 중인 이벤트만", zoom: "확대/축소", zoomLabel: "타임라인 확대/축소",
    loadingServers: "서버 불러오는 중: {done} / {total}", checked: "확인 시간: {time}", cached: "Discord 캐시의 이벤트",
    warning: "서버를 새로 고치지 못했습니다({count}개): {servers}. 기존 이벤트는 유지됩니다. 새로 고침을 눌러 보세요.",
    loading: "이벤트를 모으는 중…", empty: "이 기간에는 이벤트가 없습니다", emptyHint: "다른 날짜를 선택하거나 필터를 해제하세요.",
    emptyGrid: "이 날짜에는 이벤트가 없습니다. 타임라인을 스크롤하거나 필터를 해제하세요.", gridLabel: "무한 스크롤 이벤트 타임라인",
    live: "진행 중", liveShort: "진행 중", repeats: "반복", repeatedEvent: "반복 이벤트",
    estimateLegend: "≈ 종료 시간 미지정 · {hours}시간 표시", estimated: "예상 종료 시간", until: "종료",
    closeDetail: "이벤트 상세 닫기", estimateHint: "주최자가 종료 시간을 지정하지 않았습니다. 표시된 길이는 대략적인 시간입니다.",
    noDescription: "설명이 없습니다.", openEvent: "Discord에서 이벤트 열기 ↗", launcher: "모든 서버의 이벤트", openTimeline: "이벤트 타임라인 열기",
    about: "모든 서버의 일정을 간결하게 표시합니다. 검색, 반복 이벤트, 현지 시간, 서버 필터를 지원합니다.",
    events_one: "이벤트 {count}개", events_few: "이벤트 {count}개", events_many: "이벤트 {count}개", events_other: "이벤트 {count}개",
    guilds_one: "서버 {count}개", guilds_few: "서버 {count}개", guilds_many: "서버 {count}개", guilds_other: "서버 {count}개"
};

export const messages: Record<Language, Messages> = { ru, en, ja, es, ko };

export function resolveLanguage(choice: string, discordLocale: string): Language {
    const code = (choice === "auto" ? discordLocale : choice).toLowerCase().split(/[-_]/)[0];
    return languages.find(item => item.value === code)?.value ?? "en";
}

export function translator(language: string) {
    const selected = languages.find(item => item.value === language) ?? languages[0];
    const dictionary = messages[selected.value];
    const plurals = new Intl.PluralRules(selected.locale);
    const numbers = new Intl.NumberFormat(selected.locale);
    function t(key: Key, values: Record<string, string | number> = {}) {
        return dictionary[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
    }
    function count(value: number, kind: "events" | "guilds") {
        const category = plurals.select(value);
        const key = `${kind}_${category}` as Key;
        return t(key in dictionary ? key : `${kind}_other`, { count: numbers.format(value) });
    }
    return { t, count, locale: selected.locale, language: selected.value };
}
