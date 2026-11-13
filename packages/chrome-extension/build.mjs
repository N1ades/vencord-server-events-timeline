import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const plugin = dirname(fileURLToPath(import.meta.resolve("@server-events-timeline/vencord-plugin/package.json")));
const upstream = join(root, ".build", "vencord");
const revision = "d07030c0968e31e41caa0c35fda0ef8ae63a079e";
const upstreamUrl = "https://github.com/Vendicated/Vencord.git";
const output = join(root, "dist", "chromium-unpacked");

function git(args, stdio = "inherit") {
    return execFileSync("git", ["-C", upstream, ...args], { stdio, encoding: "utf8" });
}

mkdirSync(upstream, { recursive: true });
if (!existsSync(join(upstream, ".git"))) {
    git(["init"]);
}
git(["config", "remote.origin.url", upstreamUrl]);
let head;
try {
    head = git(["rev-parse", "--verify", "HEAD"], "pipe").trim();
} catch {
    // A fresh checkout has no HEAD yet.
}
if (head !== revision) {
    git(["fetch", "--depth", "1", "origin", revision]);
    git(["checkout", "--detach", "FETCH_HEAD"]);
}
if (!existsSync(join(upstream, "node_modules", "esbuild"))) {
    execSync("pnpm install --frozen-lockfile", { cwd: upstream, stdio: "inherit" });
}

const embeddedPlugin = join(upstream, "src", "userplugins", "serverEventsTimeline");
mkdirSync(embeddedPlugin, { recursive: true });
for (const file of readdirSync(plugin, { withFileTypes: true })) {
    if (file.isFile() && ([".ts", ".tsx", ".css"].includes(extname(file.name)) || file.name === "LICENSE")) {
        copyFileSync(join(plugin, file.name), join(embeddedPlugin, file.name));
    }
}

const extensionFiles = fileURLToPath(new URL("./browser/", import.meta.url));
for (const file of readdirSync(extensionFiles)) {
    copyFileSync(join(extensionFiles, file), join(upstream, "browser", file));
}

const args = ["scripts/build/buildWeb.mjs"];
if (process.argv.includes("--dev")) args.push("--dev");
execFileSync(process.execPath, args, { cwd: upstream, stdio: "inherit" });

const extension = join(upstream, "dist", "chromium-unpacked");
const manifest = JSON.parse(readFileSync(join(extension, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3 || !manifest.action) {
    throw new Error("Vencord did not produce the Chrome extension manifest.");
}
cpSync(extension, output, { recursive: true });
for (const file of readdirSync(extensionFiles).filter(file => file.startsWith("timeline-options."))) {
    copyFileSync(join(extensionFiles, file), join(output, file));
}
copyFileSync(join(upstream, "LICENSE"), join(output, "LICENSE"));
copyFileSync(join(upstream, "dist", "extension.js.LEGAL.txt"), join(output, "THIRD-PARTY-NOTICES.txt"));
copyFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), join(output, "README.md"));
console.log(`Load unpacked from ${output}`);
