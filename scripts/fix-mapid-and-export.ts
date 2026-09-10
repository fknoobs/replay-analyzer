import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { stripReplayMetadata, parseHeader } from "../src/index";

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

/** Find 16-byte map id that sits in the 20-byte block before mapName. */
function findMapIdOffset(buf: Uint8Array): number {
    const idx = indexOf(buf, "DATASDSC");
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 28 + nameLen;
    // walk like parser to the 20-byte block
    let p = dataStart + 4;
    const dateChars = view.getUint32(p, true);
    p += 4 + dateChars * 2 + 12;
    const modLen = view.getUint32(p, true);
    p += 4 + modLen;
    const mapFileLen = view.getUint32(p, true);
    p += 4 + mapFileLen;
    // p now at 20-byte block; first 16 are map id-ish
    return p;
}

const vire = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const control = stripReplayMetadata(
    new Uint8Array(readFileSync(join(pb, "1_control_ok.rec"))),
);

const vOff = findMapIdOffset(vire);
const cOff = findMapIdOffset(control);
console.log("vire mapId", Buffer.from(vire.subarray(vOff, vOff + 20)).toString("hex"));
console.log("ctrl mapId", Buffer.from(control.subarray(cOff, cOff + 20)).toString("hex"));

// Test: vire with ONLY the 16-byte map id + trailing u32 copied from control
// (keep path/name as-is) — if still fails, need fuller SDSC
const onlyId = vire.slice();
onlyId.set(control.subarray(cOff, cOff + 20), vOff);
writeFileSync(join(pb, "T1_only_mapid.rec"), onlyId);

// Test: path+name+mod already patched earlier still failed; try transplant
// map id AND path AND name from a working approach = use B as reference

// Rebuild 5-style but also replace map id block
function setAsciiAt(buf: Uint8Array, oldStr: string, newStr: string) {
    if (oldStr.length !== newStr.length) throw new Error("len");
    const out = buf.slice();
    const i = indexOf(out, oldStr);
    if (i < 0) throw new Error("missing " + oldStr);
    out.set(Buffer.from(newStr, "ascii"), i);
    return out;
}

// Use known-good B file as the CoH-listable export for the user
const b = readFileSync(join(pb, "B_vire_plus_ctrl_DATASDSC.rec"));
writeFileSync(join(pb, "COH_LISTABLE_vire_with_langres_sdsc.rec"), b);
writeFileSync("COH_LISTABLE_vire_with_langres_sdsc.rec", b);
console.log(
    "listable export",
    parseHeader(b).mapName,
    parseHeader(b).modName,
    "NOTE: lists in CoH but playback will be wrong map metadata",
);

const keep = new Set([
    "1_control_ok.rec",
    "B_vire_plus_ctrl_DATASDSC.rec",
    "COH_LISTABLE_vire_with_langres_sdsc.rec",
    "T1_only_mapid.rec",
    "S6_all_safe_patches.rec",
]);
for (const f of readdirSync(pb)) {
    if (f.endsWith(".rec") && !keep.has(f)) {
        try {
            unlinkSync(join(pb, f));
        } catch {
            /* */
        }
    }
}
console.log(readdirSync(pb).filter((f) => f.endsWith(".rec")).sort());
