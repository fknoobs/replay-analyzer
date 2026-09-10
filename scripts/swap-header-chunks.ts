import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { parseHeader, stripReplayMetadata } from "../src/index";
import { ReplayStream } from "../src/replay-stream";

const pb = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);

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

/** Extract full Relic chunk [header+payload] starting at type ASCII. */
function extractChunk(buf: Uint8Array, type: string): { start: number; end: number; bytes: Uint8Array } {
    const start = indexOf(buf, type);
    if (start < 0) throw new Error("missing " + type);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const chunkLen = view.getUint32(start + 12, true);
    const nameLen = view.getUint32(start + 16, true);
    const dataStart = start + 28 + nameLen;
    const end = dataStart + chunkLen;
    return { start, end, bytes: buf.subarray(start, end) };
}

function replaceChunk(buf: Uint8Array, type: string, newChunk: Uint8Array): Uint8Array {
    const { start, end } = extractChunk(buf, type);
    const out = new Uint8Array(buf.length - (end - start) + newChunk.length);
    out.set(buf.subarray(0, start), 0);
    out.set(newChunk, start);
    out.set(buf.subarray(end), start + newChunk.length);

    // Fix parent FOLDINFO length if DATABASE/DATASDSC sit inside it
    if (type === "DATABASE" || type === "DATASDSC") {
        const fold = indexOf(out, type === "DATASDSC" ? "FOLDINFO" : "FOLDINFO");
        // DATASDSC is usually in first chunky (not under FOLDINFO); DATABASE under FOLDINFO
        if (type === "DATABASE") {
            const foldStart = indexOf(out, "FOLDINFO");
            if (foldStart >= 0) {
                const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
                const oldFoldLen = view.getUint32(foldStart + 12, true);
                const delta = newChunk.length - (end - start);
                // Only update if DATABASE still inside this fold's old range conceptually
                view.setUint32(foldStart + 12, oldFoldLen + delta, true);
            }
        }
    }
    return out;
}

const vire = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const control = stripReplayMetadata(
    new Uint8Array(readFileSync(join(pb, "1_control_ok.rec"))),
);

const vireDb = extractChunk(vire, "DATABASE");
const ctrlDb = extractChunk(control, "DATABASE");
const vireSdsc = extractChunk(vire, "DATASDSC");
const ctrlSdsc = extractChunk(control, "DATASDSC");

console.log({
    vireDbLen: vireDb.bytes.length,
    ctrlDbLen: ctrlDb.bytes.length,
    vireSdscLen: vireSdsc.bytes.length,
    ctrlSdscLen: ctrlSdsc.bytes.length,
});

// A: vire body + control DATABASE
const withCtrlDb = replaceChunk(vire, "DATABASE", ctrlDb.bytes);
// B: vire body + control DATASDSC
const withCtrlSdsc = replaceChunk(vire, "DATASDSC", ctrlSdsc.bytes);
// C: both
let withBoth = replaceChunk(vire, "DATASDSC", ctrlSdsc.bytes);
withBoth = replaceChunk(withBoth, "DATABASE", ctrlDb.bytes);

// D: control body + vire DATABASE (does good file break?)
const ctrlWithVireDb = replaceChunk(control, "DATABASE", vireDb.bytes);
// E: control + vire DATASDSC
const ctrlWithVireSdsc = replaceChunk(control, "DATASDSC", vireSdsc.bytes);

const keep = new Set([
    "1_control_ok.rec",
    "A_vire_plus_ctrl_DATABASE.rec",
    "B_vire_plus_ctrl_DATASDSC.rec",
    "C_vire_plus_ctrl_BOTH.rec",
    "D_ctrl_plus_vire_DATABASE.rec",
    "E_ctrl_plus_vire_DATASDSC.rec",
]);

const outs: [string, Uint8Array][] = [
    ["A_vire_plus_ctrl_DATABASE.rec", withCtrlDb],
    ["B_vire_plus_ctrl_DATASDSC.rec", withCtrlSdsc],
    ["C_vire_plus_ctrl_BOTH.rec", withBoth],
    ["D_ctrl_plus_vire_DATABASE.rec", ctrlWithVireDb],
    ["E_ctrl_plus_vire_DATASDSC.rec", ctrlWithVireSdsc],
];

for (const [name, bytes] of outs) {
    try {
        const h = parseHeader(bytes);
        writeFileSync(join(pb, name), bytes);
        console.log(name, "ok map=", h.mapName, "size=", bytes.length);
    } catch (e) {
        console.log(name, "PARSE FAIL", e);
    }
}

for (const f of readdirSync(pb)) {
    if (!f.endsWith(".rec")) continue;
    if (!keep.has(f)) {
        try {
            unlinkSync(join(pb, f));
        } catch {
            /* */
        }
    }
}

console.log("playback:", readdirSync(pb).filter((f) => f.endsWith(".rec")).sort());
