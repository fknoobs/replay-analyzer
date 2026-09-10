import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseHeader, setReplayName } from "../src/index";
import { ReplayStream } from "../src/replay-stream";

const pb = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);

const control = new Uint8Array(
    readFileSync(join(pb, "control_langres_ok.rec")),
);
const renamed = setReplayName(control, "Langres rename test");
writeFileSync(join(pb, "control_renamed_by_us.rec"), renamed);
console.log({
    controlName: JSON.stringify(parseHeader(control).replayName),
    controlSize: control.length,
    renamedName: JSON.stringify(parseHeader(renamed).replayName),
    renamedSize: renamed.length,
});

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

/** In-place same-length map path rewrite inside DATASDSC. */
function rewriteMapPathSameLen(buf: Uint8Array, newPath: string): Uint8Array {
    const out = buf.slice();
    const idx = indexOf(out, "DATA:Scenarios\\MP\\VIRE RIVER VALLEY (8)  ");
    if (idx < 0) throw new Error("uppercase map path not found");
    if (newPath.length !== 41) throw new Error("need len 41");
    for (let i = 0; i < 41; i++) out[idx + i] = newPath.charCodeAt(i);
    return out;
}

const cleaned = new Uint8Array(
    readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
);
const lower = rewriteMapPathSameLen(
    cleaned,
    "DATA:scenarios\\mp\\vire river valley (8)  ",
);
writeFileSync(join(pb, "vire_map_lowercase.rec"), lower);
writeFileSync("vire_map_lowercase.rec", lower);
console.log("wrote vire_map_lowercase.rec");

// Also try replacing ✓ in map display name with ASCII 'x' (same UTF-16 length)
function replaceCheckmark(buf: Uint8Array): Uint8Array {
    const out = buf.slice();
    // UTF-16LE for ✓ is 0x13 0x27
    const name = "Vire River Valley ✓ (8)";
    // find UTF-16LE encoding of the checkmark between Valley and space (
    for (let i = 0; i < out.length - 1; i++) {
        if (out[i] === 0x13 && out[i + 1] === 0x27) {
            out[i] = "x".charCodeAt(0);
            out[i + 1] = 0;
            console.log("replaced checkmark at", i);
            break;
        }
    }
    return out;
}

const noCheck = replaceCheckmark(lower);
writeFileSync(join(pb, "vire_map_lower_nocheck.rec"), noCheck);
console.log("wrote vire_map_lower_nocheck.rec map=", parseHeader(noCheck).mapName);
