import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseHeader, stripReplayMetadata } from "../src/index";
import { ReplayStream } from "../src/replay-stream";

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
    const version = stream.readUInt32();
    if (version !== 3) {
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
        // modName
        const modLen = stream.readUInt32();
        stream.skip(modLen);
        // mapFileName starts here
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
    throw new Error("DATASDSC mapFileName not found");
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

const cleaned = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);

const official = "DATA:scenarios\\mp\\classic\\2p_langres\\2p_langres";
const patched = setMapFileName(cleaned, official);
const h = parseHeader(patched);
console.log({
    size: patched.length,
    map: h.mapName,
    mod: h.modName,
    // re-read map file
});

// verify
const loc = locateMapFile(patched);
const v = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
const n = v.getUint32(loc.stringStart, true);
const s = Buffer.from(
    patched.subarray(loc.stringStart + 4, loc.stringStart + 4 + n),
).toString("ascii");
console.log("new mapFile", JSON.stringify(s));

const playback = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);
writeFileSync("vire_map_patched_langres.rec", patched);
writeFileSync(join(playback, "vire_map_patched_langres.rec"), patched);
writeFileSync(join(playback, "aaa_control_langres_ok.rec"), readFileSync(
    join(playback, "control_langres_ok.rec"),
));
console.log("wrote vire_map_patched_langres.rec and aaa_control_langres_ok.rec");
console.log("Open Game History again — check warnings.log for which still error.");
