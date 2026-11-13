import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";

const dir = resolve(".output/preview");
await mkdir(dir, { recursive: true });
await build({
    entryPoints: ["scripts/preview.tsx"], outfile: `${dir}/preview.js`, bundle: true,
    jsx: "automatic",
    plugins: [{ name: "discord-react-shim", setup(builder) {
        builder.onResolve({ filter: /^@webpack\/common$/ }, () => ({ path: "react-hooks", namespace: "shim" }));
        builder.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
            contents: 'export { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";',
            resolveDir: process.cwd()
        }));
    } }]
});
await copyFile("style.css", `${dir}/style.css`);
await writeFile(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Server Events Timeline — Preview</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css">
<style>body{margin:0;background:#0d0e13;font-family:Arial,sans-serif;}button,input,select{font-family:inherit;}</style>
</head><body><div id="root"></div><script src="/preview.js"></script></body></html>`);

const allowed = new Map([["/", "index.html"], ["/index.html", "index.html"], ["/preview.js", "preview.js"], ["/style.css", "style.css"]]);
if (!process.argv.includes("--build-only")) {
    const port = Number(process.env.PORT ?? 8767);
    const server = http.createServer(async (request, response) => {
        try {
            const file = allowed.get(new URL(request.url, "http://localhost").pathname);
            if (!file) { response.writeHead(404); response.end(); return; }
            const mime = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
            response.writeHead(200, { "Content-Type": `${mime}; charset=utf-8`, "Cache-Control": "no-store" });
            response.end(await readFile(`${dir}/${file}`));
        } catch {
            response.writeHead(500);
            response.end("Could not load preview asset.");
        }
    });
    server.on("error", error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${port} — synthetic events only`));
}
