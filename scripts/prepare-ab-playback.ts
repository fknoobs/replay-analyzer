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

type Loc = {
    stringStart: number;
    stringEnd: number;
    chunkLengthOffsets: number[];
};

function tryEnterChunky(stream: ReplayStream): boolean {
    const pos = stream.position;
    if (pos + 12 > stream.length) return false;
    if (stream.readASCIIStr(12) !== "Relic Chunky") {
        stream.seek(pos);
        return false;
    }
    stream.skip(4);
    if (stream.readUInt32() !== 3) {
        stream.seek(pos);
        return false;
    }
    stream.skip(4);
    const length = stream.readUInt32();
    stream.skip(length - 28);
    return true;
}

function walkForMapFile(
    stream: ReplayStream,
    ancestors: number[],
): { loc: Loc | null; advanced: boolean } {
    if (stream.position + 8 > stream.length) {
        return { loc: null, advanced: false };
    }
    const chunkStart = stream.position;
    const chunkType = stream.readASCIIStr(8);
    if (!(chunkType.startsWith("FOLD") || chunkType.startsWith("DATA"))) {
        stream.seek(chunkStart);
        return { loc: null, advanced: false };
    }
    const chunkVersion = stream.readUInt32();
    const chunkLengthOffset = stream.position;
    const chunkLength = stream.readUInt32();
    const chunkNameLength = stream.readUInt32();
    stream.skip(8);
    if (chunkNameLength > 0) stream.skip(chunkNameLength);
    const dataStart = stream.position;
    const nextAncestors = [...ancestors, chunkLengthOffset];

    if (chunkType.startsWith("FOLD")) {
        const foldEnd = dataStart + chunkLength;
        while (stream.position < foldEnd) {
            const child = walkForMapFile(stream, nextAncestors);
            if (child.loc) return { loc: child.loc, advanced: true };
            if (!child.advanced) break;
        }
    } else if (chunkType.startsWith("DATASDSC") && chunkVersion === 0x7d4) {
        stream.seek(dataStart);
        stream.skip(4);
        const len = stream.readUInt32();
        stream.skip(12 + 2 * len);
        const modLen = stream.readUInt32();
        stream.skip(modLen);
        const stringStart = stream.position;
        const mapLen = stream.readUInt32();
        stream.skip(mapLen);
        return {
            loc: {
                stringStart,
                stringEnd: stream.position,
                chunkLengthOffsets: nextAncestors,
            },
            advanced: true,
        };
    }

    stream.seek(dataStart + chunkLength);
    return { loc: null, advanced: true };
}

function locateMapFile(body: Uint8Array): Loc {
    const stream = new ReplayStream(body);
    stream.seek(76);
    for (let i = 0; i < 2; i++) {
        if (!tryEnterChunky(stream)) break;
        while (true) {
            const result = walkForMapFile(stream, []);
            if (result.loc) return result.loc;
            if (!result.advanced) break;
        }
    }
    throw new Error("map file not found");
}

function setMapFileName(input: Uint8Array, mapFileName: string): Uint8Array {
    const body = stripReplayMetadata(input);
    const location = locateMapFile(body);
    const encoded = new Uint8Array(4 + mapFileName.length);
    const view = new DataView(encoded.buffer);
    view.setUint32(0, mapFileName.length, true);
    for (let i = 0; i < mapFileName.length; i++) {
        encoded[4 + i] = mapFileName.charCodeAt(i);
    }
    const delta = encoded.length - (location.stringEnd - location.stringStart);
    const rewritten = new Uint8Array(body.length + delta);
    rewritten.set(body.subarray(0, location.stringStart), 0);
    rewritten.set(encoded, location.stringStart);
    rewritten.set(
        body.subarray(location.stringEnd),
        location.stringStart + encoded.length,
    );
    if (delta !== 0) {
        const v = new DataView(
            rewritten.buffer,
            rewritten.byteOffset,
            rewritten.byteLength,
        );
        for (const offset of location.chunkLengthOffsets) {
            v.setUint32(offset, v.getUint32(offset, true) + delta, true);
        }
    }
    return rewritten;
}

/** Also rewrite unicode map display name after map file + 20 pad bytes. */
function setMapDisplayName(body: Uint8Array, name: string): Uint8Array {
    const location = locateMapFile(body);
    // After map file string comes 20 bytes then unicode length-prefixed name
    const afterMap = location.stringStart + 4 + body[location.stringStart] +
        (body[location.stringStart + 1] << 8) +
        (body[location.stringStart + 2] << 16) +
        (body[location.stringStart + 3] << 24);
    // easier: use DataView
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const mapLen = view.getUint32(location.stringStart, true);
    const padStart = location.stringStart + 4 + mapLen;
    const nameStart = padStart + 20;
    const oldChars = view.getUint32(nameStart, true);
    const oldEnd = nameStart + 4 + oldChars * 2;

    // Need chunk length offsets again - DATASDSC ancestors
    const loc = locateMapFile(body);

    const encoded = new Uint8Array(4 + name.length * 2);
    const ev = new DataView(encoded.buffer);
    ev.setUint32(0, name.length, true);
    for (let i = 0; i < name.length; i++) {
        ev.setUint16(4 + i * 2, name.charCodeAt(i), true);
    }
    const delta = encoded.length - (oldEnd - nameStart);
    const rewritten = new Uint8Array(body.length + delta);
    rewritten.set(body.subarray(0, nameStart), 0);
    rewritten.set(encoded, nameStart);
    rewritten.set(body.subarray(oldEnd), nameStart + encoded.length);
    if (delta !== 0) {
        const v = new DataView(
            rewritten.buffer,
            rewritten.byteOffset,
            rewritten.byteLength,
        );
        for (const offset of loc.chunkLengthOffsets) {
            // offsets before nameStart are still valid
            if (offset < nameStart) {
                v.setUint32(offset, v.getUint32(offset, true) + delta, true);
            }
        }
    }
    return rewritten;
}

const cleaned = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);

const officialPath = "DATA:scenarios\\mp\\classic\\2p_langres\\2p_langres";
let patched = setMapFileName(cleaned, officialPath);
patched = setMapDisplayName(patched, "$60990");

const h = parseHeader(patched);
console.log({
    map: h.mapName,
    mod: h.modName,
    size: patched.length,
});

// Keep playback lean for A/B
const keep = new Set([
    "1_control_ok.rec",
    "2_mut_iso_date_on_control.rec",
    "3_mut_modcase_on_control.rec",
    "4_vire_clean.rec",
    "5_vire_official_map_header.rec",
]);

const control = stripReplayMetadata(
    new Uint8Array(readFileSync(join(pb, "control_langres_ok.rec"))),
);

// rebuild mut A/B quickly
function rawDate(buf: Uint8Array) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let n = 0;
    while (view.getUint16(12 + n * 2, true) !== 0) n++;
    let s = "";
    for (let i = 0; i < n; i++) {
        s += String.fromCharCode(view.getUint16(12 + i * 2, true));
    }
    return s;
}
function setRawDate(buf: Uint8Array, date: string) {
    const out = buf.slice();
    const old = rawDate(out);
    if (old.length !== date.length) throw new Error("len");
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < date.length; i++) {
        view.setUint16(12 + i * 2, date.charCodeAt(i), true);
    }
    return out;
}
function replaceAscii(buf: Uint8Array, from: string, to: string) {
    const out = buf.slice();
    const needle = Buffer.from(from, "ascii");
    outer: for (let i = 0; i < out.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (out[i + j] !== needle[j]) continue outer;
        }
        for (let j = 0; j < to.length; j++) out[i + j] = to.charCodeAt(j);
        return out;
    }
    throw new Error("missing " + from);
}

writeFileSync(join(pb, "1_control_ok.rec"), control);
writeFileSync(
    join(pb, "2_mut_iso_date_on_control.rec"),
    setRawDate(control, "2025-12-08 01:05"),
);
writeFileSync(
    join(pb, "3_mut_modcase_on_control.rec"),
    replaceAscii(control, "RelicCoH", "RelicCOH"),
);
writeFileSync(join(pb, "4_vire_clean.rec"), cleaned);
writeFileSync(join(pb, "5_vire_official_map_header.rec"), patched);
writeFileSync("5_vire_official_map_header.rec", patched);

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
console.log(
    "NEXT: In CoH open Multiplayer → Game History. Then tell me which of 1..5 show up.",
);
