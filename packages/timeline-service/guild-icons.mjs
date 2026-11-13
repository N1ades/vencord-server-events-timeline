import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const iconPath = /^\/icons\/(\d{16,22})\/((?:a_)?[a-f0-9]{32})\.webp$/;
const maxBytes = 256 * 1024;

export function guildIconCache(directory, isPublished) {
    const pending = new Map();

    async function download(guildId, hash, file) {
        const url = `https://cdn.discordapp.com/icons/${guildId}/${hash}.webp?size=64`;
        const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
        if (response.status === 404) {
            await response.body?.cancel();
            return null;
        }
        if (!response.ok || !response.body || response.headers.get("content-type")?.split(";")[0] !== "image/webp") {
            await response.body?.cancel();
            throw new Error("Invalid Discord CDN response");
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > maxBytes) throw new Error("Discord icon exceeds size limit");
            chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks, size);
        if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
            throw new Error("Invalid Discord WebP icon");
        }
        await mkdir(directory, { recursive: true });
        const temporary = file + "." + randomUUID() + ".tmp";
        try {
            await writeFile(temporary, bytes, { flag: "wx" });
            await rename(temporary, file);
        } finally {
            await rm(temporary, { force: true });
        }
        return bytes;
    }

    return async pathname => {
        const match = iconPath.exec(pathname);
        if (!match) return null;
        const [, guildId, hash] = match;
        const key = guildId + "-" + hash;
        const file = join(directory, key + ".webp");
        try { return await readFile(file); }
        catch (error) { if (error.code !== "ENOENT") throw error; }

        if (!isPublished(guildId, hash)) return null;
        if (!pending.has(key)) {
            if (pending.size >= 8) throw new Error("Discord icon cache busy");
            pending.set(key, download(guildId, hash, file).finally(() => pending.delete(key)));
        }
        return pending.get(key);
    };
}
