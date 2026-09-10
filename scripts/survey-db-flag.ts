import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { stripReplayMetadata } from "../src/index";

function indexOf(buf: Uint8Array, s: string) {
    const needle = Buffer.from(s, "ascii");
    outer: for (let i = 0; i < buf.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (buf[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

function lastDbByte(path: string): number | null {
    try {
        const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
        const idx = indexOf(body, "DATABASE");
        if (idx < 0) return null;
        const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
        const chunkLen = view.getUint32(idx + 12, true);
        const nameLen = view.getUint32(idx + 16, true);
        const dataStart = idx + 28 + nameLen;
        return body[dataStart + chunkLen - 1] ?? null;
    } catch {
        return null;
    }
}

const roots = [
    "fixtures",
    join(process.env.TEMP!, "coh-playback-zip", "playback"),
    ".",
];

const counts = { zero: 0, one: 0, other: 0, fail: 0 };
const zeros: string[] = [];
for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const f of readdirSync(root)) {
        if (!f.endsWith(".rec")) continue;
        const path = join(root, f);
        const b = lastDbByte(path);
        if (b === null) {
            counts.fail++;
            continue;
        }
        if (b === 0) {
            counts.zero++;
            zeros.push(path);
        } else if (b === 1) counts.one++;
        else {
            counts.other++;
            console.log("other", b, path);
        }
    }
}
console.log(counts);
console.log("files with lastByte=0:", zeros);
