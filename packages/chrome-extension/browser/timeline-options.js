const form = document.querySelector("form");
const token = document.querySelector("#token");
const all = document.querySelector("#all");
const guilds = document.querySelector("#guilds");
const status = document.querySelector("#status");
const { timelineConfig = {}, timelineGuilds = [] } = await chrome.storage.local.get(["timelineConfig", "timelineGuilds"]);
token.value = timelineConfig.token ?? "";
all.checked = timelineConfig.all ?? false;
const ids = new Set(timelineConfig.guilds ?? []);
const inputs = [];
for (const guild of timelineGuilds) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = all.checked;
    input.checked = ids.has(guild.id);
    input.value = guild.id;
    input.addEventListener("change", () => { if (input.checked) ids.add(guild.id); else ids.delete(guild.id); });
    inputs.push(input);
    label.append(input, " " + guild.name);
    guilds.append(label);
}
if (!inputs.length) guilds.textContent = "Открой календарь в Discord, чтобы загрузить список серверов.";
all.addEventListener("change", () => inputs.forEach(input => { input.disabled = all.checked; }));
form.addEventListener("submit", async event => {
    event.preventDefault();
    await chrome.storage.local.set({ timelineConfig: { token: token.value.trim(), all: all.checked, guilds: [...ids] } });
    status.textContent = "Сохранено. Открой или обнови календарь в Discord.";
});
function report(result) {
    if (!result) return;
    status.textContent = result.retry ? `Сервис недоступен или ключ не подошёл. В очереди: ${result.pending}. Будет повторная попытка.`
        : `Отправлено за последнюю попытку: ${result.sent}. Отклонено: ${result.failed}. В очереди: ${result.pending}.`;
}
report((await chrome.storage.local.get("timelineResult")).timelineResult);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.timelineResult) report(changes.timelineResult.newValue);
});
