import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { parseHeader, stripReplayMetadata } from "../src/index";

function indexOf(buf: Uint8Array, s: string, from = 0) {
    const needle = Buffer.from(s, "ascii");
    outer: for (let i = from; i < buf.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (buf[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

/** Rewrite null-terminated UTF-16LE date at offset 12 without changing length. */
function rewriteDateSameLength(buf: Uint8Array, newDate: string): Uint8Array {
    const out = buf.slice();
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    // measure old length
    let oldLen = 0;
    while (view.getUint16(12 + oldLen * 2, true) !== 0) oldLen++;
    if (newDate.length !== oldLen) {
        throw new Error(
            `date length mismatch: need ${oldLen} chars, got ${newDate.length} (${newDate})`,
        );
    }
    for (let i = 0; i < oldLen; i++) {
        view.setUint16(12 + i * 2, newDate.charCodeAt(i), true);
    }
    return out;
}

/** Replace ASCII modName RelicCOH -> RelicCoH in-place (same length). */
function fixModCase(buf: Uint8Array): Uint8Array {
    const out = buf.slice();
    const idx = indexOf(out, "RelicCOH");
    if (idx < 0) {
        console.log("RelicCOH not found");
        return out;
    }
    // RelicCoH
    const fixed = Buffer.from("RelicCoH", "ascii");
    out.set(fixed, idx);
    console.log("fixed RelicCOH at", idx);
    return out;
}

const playback = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);

const cleaned = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);

// Original date "2026-09-08 20:51" is 16 chars.
// Candidates of same length:
const candidates: [string, string][] = [
    ["date-us", "09/08/2026 20:51"], // 16
    ["date-eu", "08/09/2026 20:51"], // 16
    ["mod-only", ""], // just mod fix
    ["date-us+mod", "09/08/2026 20:51"],
];

for (const [label, date] of candidates) {
    let next = cleaned.slice();
    if (date) next = rewriteDateSameLength(next, date);
    if (label.includes("mod")) next = fixModCase(next);
    const name = `coh_test_${label}.rec`;
    writeFileSync(name, next);
    writeFileSync(join(playback, name), next);
    const h = parseHeader(next);
    console.log("wrote", name, {
        date: h.gameDate,
        mod: h.modName,
        map: h.mapName,
    });
}

console.log("playback now:");
console.log(
    require("fs")
        .readdirSync(playback)
        .filter((f: string) => f.endsWith(".rec")),
);
