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

function dumpSdsc(label: string, buf: Uint8Array) {
    const body = stripReplayMetadata(buf);
    const idx = indexOf(body, "DATASDSC");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const ver = view.getUint32(idx + 8, true);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 28 + nameLen;
    const stream = new ReplayStream(body);
    stream.seek(dataStart);
    const u0 = stream.readUInt32();
    const dateChars = stream.readUInt32();
    const date = stream.readUnicodeStr(dateChars);
    const mid12 = Buffer.from(body.subarray(stream.position, stream.position + 12)).toString("hex");
    stream.skip(12);
    const modLen = stream.readUInt32();
    const mod = stream.readASCIIStr(modLen);
    const mapFileLen = stream.readUInt32();
    const mapFile = stream.readASCIIStr(mapFileLen);
    const mid20 = Buffer.from(body.subarray(stream.position, stream.position + 20)).toString("hex");
    stream.skip(20);
    const mapNameChars = stream.readUInt32();
    const mapName = stream.readUnicodeStr(mapNameChars);
    const descChars = stream.readUInt32();
    const desc = stream.readUnicodeStr(Math.min(descChars, 40));
    const restPos = stream.position;
    const rest = Buffer.from(body.subarray(restPos, dataStart + chunkLen)).toString("hex");
    console.log({
        label,
        ver,
        chunkLen,
        u0,
        date: JSON.stringify(date),
        mid12,
        mod: JSON.stringify(mod),
        mapFile: JSON.stringify(mapFile),
        mid20,
        mapName: JSON.stringify(mapName),
        descChars,
        desc: JSON.stringify(desc),
        restLen: dataStart + chunkLen - restPos,
        rest: rest.slice(0, 120),
    });
    return { body, idx, dataStart, chunkLen, nameLen };
}

const vire = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const control = stripReplayMetadata(
    new Uint8Array(readFileSync(join(pb, "1_control_ok.rec"))),
);
const bznk = stripReplayMetadata(
    new Uint8Array(readFileSync("replay_bznk6qkkzf_pcladdt4mp.rec")),
);

dumpSdsc("vire", vire);
dumpSdsc("control", control);
dumpSdsc("bznk", bznk);

// In-place same-length patches on vire DATASDSC fields
function patchModCase(buf: Uint8Array): Uint8Array {
    const out = buf.slice();
    const i = indexOf(out, "RelicCOH");
    if (i < 0) throw new Error("RelicCOH missing");
    out.set(Buffer.from("RelicCoH", "ascii"), i);
    return out;
}

function patchMapPathCase(buf: Uint8Array): Uint8Array {
    const out = buf.slice();
    const from = "DATA:Scenarios\\MP\\VIRE RIVER VALLEY (8)  ";
    const to = "DATA:scenarios\\mp\\vire river valley (8)  ";
    const i = indexOf(out, from);
    if (i < 0) throw new Error("map path missing");
    out.set(Buffer.from(to, "ascii"), i);
    return out;
}

function patchCheckmarkInHeaderOnly(buf: Uint8Array): Uint8Array {
    const out = buf.slice();
    // Only first checkmark (in DATASDSC map name ~offset 405)
    for (let i = 0; i < Math.min(out.length, 2000); i++) {
        if (out[i] === 0x13 && out[i + 1] === 0x27) {
            out[i] = 0x20; // space
            out[i + 1] = 0x00;
            return out;
        }
    }
    throw new Error("checkmark not in header");
}

function patchSdscDate(buf: Uint8Array, newDate: string): Uint8Array {
    // SDSC date is length-prefixed unicode after u32 u0
    const idx = indexOf(buf, "DATASDSC");
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 28 + nameLen;
    const dateLenPos = dataStart + 4;
    const oldChars = view.getUint32(dateLenPos, true);
    if (newDate.length !== oldChars) {
        throw new Error(`sdsc date len ${oldChars} vs ${newDate.length}`);
    }
    const out = buf.slice();
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < oldChars; i++) {
        v.setUint16(dateLenPos + 4 + i * 2, newDate.charCodeAt(i), true);
    }
    return out;
}

const keep = new Set([
    "1_control_ok.rec",
    "B_vire_plus_ctrl_DATASDSC.rec", // known good fix
    "S1_modcase.rec",
    "S2_mappath_case.rec",
    "S3_nocheck.rec",
    "S4_mod_path_check.rec",
    "S5_sdsc_date.rec",
    "S6_all_safe_patches.rec",
]);

const s1 = patchModCase(vire);
const s2 = patchMapPathCase(vire);
const s3 = patchCheckmarkInHeaderOnly(vire);
let s4 = patchModCase(vire);
s4 = patchMapPathCase(s4);
s4 = patchCheckmarkInHeaderOnly(s4);

// SDSC date is '11/06/2017 22:02' (16 chars) - try a simpler ascii date same len
const s5 = patchSdscDate(vire, "01/01/2020 12:00");

let s6 = patchModCase(vire);
s6 = patchMapPathCase(s6);
s6 = patchCheckmarkInHeaderOnly(s6);
s6 = patchSdscDate(s6, "01/01/2020 12:00");

const files: [string, Uint8Array][] = [
    ["S1_modcase.rec", s1],
    ["S2_mappath_case.rec", s2],
    ["S3_nocheck.rec", s3],
    ["S4_mod_path_check.rec", s4],
    ["S5_sdsc_date.rec", s5],
    ["S6_all_safe_patches.rec", s6],
];

for (const [name, bytes] of files) {
    writeFileSync(join(pb, name), bytes);
    console.log(name, parseHeader(bytes).modName, parseHeader(bytes).mapName);
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

console.log("playback", readdirSync(pb).filter((f) => f.endsWith(".rec")).sort());
