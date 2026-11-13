import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

const directory = ".output/site";
await mkdir(directory, { recursive: true });
await build({
    entryPoints: ["scripts/site.tsx"],
    outfile: directory + "/site.js",
    bundle: true,
    minify: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
        name: "standalone-react",
        setup(builder) {
            builder.onResolve({ filter: /^@webpack\/common$/ }, () => ({ path: "react" , namespace: "standalone" }));
            builder.onLoad({ filter: /.*/, namespace: "standalone" }, () => ({
                contents: 'export { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";',
                resolveDir: process.cwd()
            }));
        }
    }]
});
await copyFile("../timeline-service/index.html", directory + "/index.html");
