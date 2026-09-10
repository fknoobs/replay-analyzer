import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseHeader, stripReplayMetadata } from "../src/index";

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

function analyze(label: string, path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const idx = indexOf(body, "DATASDSC");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 28 + nameLen;
    const payload = body.subarray(dataStart, dataStart + chunkLen);

    console.log("\n===", label, "===");
    for (let off = 0; off + 4 < payload.length; off++) {
        const n = view.getUint32(dataStart + off, true);
        // view is on body, so use payload view instead
    }

    const pv = new DataView(
        payload.buffer,
        payload.byteOffset,
        payload.byteLength,
    );
    for (let off = 0; off + 4 < payload.length; off++) {
        const n = pv.getUint32(off, true);
        if (n < 20 || n > 260) continue;
        if (off + 4 + n * 2 > payload.length) continue;
        let s = "";
        let ok = true;
        for (let i = 0; i < n; i++) {
            const c = pv.getUint16(off + 4 + i * 2, true);
            if (c < 32 || c > 0xfff) {
                ok = false;
                break;
            }
            s += String.fromCharCode(c);
        }
        if (ok && /Users|Documents|scenarios|Vire|Richa|oscar|\.sg/i.test(s)) {
            console.log(`  LP@${off} (${n}):`, JSON.stringify(s));
        }
    }
}

function extractChunk(buf: Uint8Array, type: string) {
    const start = indexOf(buf, type);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const chunkLen = view.getUint32(start + 12, true);
    const nameLen = view.getUint32(start + 16, true);
    const end = start + 28 + nameLen + chunkLen;
    return { start, end, bytes: buf.subarray(start, end) };
}

function replaceChunk(buf: Uint8Array, type: string, newChunk: Uint8Array) {
    const { start, end } = extractChunk(buf, type);
    const out = new Uint8Array(buf.length - (end - start) + newChunk.length);
    out.set(buf.subarray(0, start), 0);
    out.set(newChunk, start);
    out.set(buf.subarray(end), start + newChunk.length);
    return out;
}

analyze("temp.rec WORKS", "temp.rec");
analyze(
    "broken",
    "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec",
);

const broken = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const temp = stripReplayMetadata(new Uint8Array(readFileSync("temp.rec")));
const fixed = replaceChunk(
    broken,
    "DATASDSC",
    extractChunk(temp, "DATASDSC").bytes,
);

const pb = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);
writeFileSync("vire_sdsc_from_temp.rec", fixed);
writeFileSync(join(pb, "vire_sdsc_from_temp.rec"), fixed);
console.log("\nwrote vire_sdsc_from_temp.rec", {
    size: fixed.length,
    map: parseHeader(fixed).mapName,
    mod: parseHeader(fixed).modName,
});
console.log("Open Game History — this should list if the local map path was the issue.");
