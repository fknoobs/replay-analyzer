/**
 * Smoke-parse every *.rec in the project root (local dumps) and fixtures/.
 * Run with: npm run smoke
 */
import fs from "fs";
import path from "path";
import { parseReplay } from "../src/replay-parser";

const roots = [process.cwd(), path.join(process.cwd(), "fixtures")];
const files = roots.flatMap((dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".rec"))
        .map((f) => path.join(dir, f));
});

const unique = [...new Set(files)].sort();

if (unique.length === 0) {
    console.log("No .rec files found.");
    process.exit(0);
}

let failed = 0;
for (const file of unique) {
    const buf = fs.readFileSync(file);
    const start = performance.now();
    const replay = parseReplay(new Uint8Array(buf));
    const ms = (performance.now() - start).toFixed(1);
    const status =
        replay.errors.length > 0
            ? `ERRORS=${replay.errors.length}`
            : replay.dataParsed
              ? "OK"
              : replay.headerParsed
                ? "HEADER_ONLY"
                : "INCOMPLETE";
    if (replay.errors.length > 0) failed++;
    console.log(
        `${status.padEnd(12)} ${ms.padStart(7)}ms  players=${replay.players.length} actions=${replay.actions.length}  ${path.basename(file)}`,
    );
    if (replay.errors.length) {
        for (const e of replay.errors.slice(0, 3)) console.log(`    - ${e}`);
    }
}

process.exit(failed > 0 ? 1 : 0);
