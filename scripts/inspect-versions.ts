import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { parseHeader, stripReplayMetadata } from "../src/index";
import { ReplayStream } from "../src/replay-stream";

/** Extract gameminor/major version strings from DATABASE (same layout as parser). */
function readGameVersions(buf: Uint8Array): {
    replayName: string;
    matchType: string;
    versions: string[];
    modName: string;
    mapName: string;
    gameDateRaw: string;
} {
    const stream = new ReplayStream(buf);
    stream.seek(0);
    stream.readUInt32();
    stream.readASCIIStr(8);
    const startPos = stream.position;
    let length = 0;
    while (stream.readUInt16() !== 0) length++;
    stream.seek(startPos);
    const gameDateRaw = stream.readUnicodeStr(length);

    const header = parseHeader(buf);
    // Dig DATABASE version strings via a light walk isn't exported; use header fields + raw scan
    const ascii = Buffer.from(buf.subarray(0, Math.min(buf.length, 8000))).toString("latin1");
    const versionHits = [...ascii.matchAll(/gamem(?:inor|ajor)version/gi)].map((m) => m.index);
    // Also find length-prefixed ASCII near known keys
    const keys = ["gameminorversion", "gamemajorversion", "gameversion"];
    const found: string[] = [];
    for (const key of keys) {
        const idx = indexOfAscii(buf, key);
        if (idx >= 0) {
            // key itself is a length-prefixed string: u32 len then ascii
            // We found the key bytes; walk back 4 for length... or read after key ends for next field
            found.push(`key@${idx}:${key}`);
        }
    }

    // Brute: find Relic-looking version tokens like 2.601 / 4.0.0.xxx near header
    const text = Buffer.from(buf.subarray(0, 4000)).toString("utf16le");
    const ascii2 = Buffer.from(buf.subarray(0, 8000)).toString("ascii");
    const verRe = /\b\d+\.\d+(?:\.\d+)?(?:\.\d+)?\b/g;
    const candidates = new Set<string>();
    for (const m of ascii2.matchAll(verRe)) {
        if (m[0].length >= 3 && m[0].length <= 12) candidates.add(m[0]);
    }

    return {
        replayName: header.replayName,
        matchType: header.matchType,
        versions: [...candidates].slice(0, 20),
        modName: header.modName,
        mapName: header.mapName,
        gameDateRaw,
    };
}

function indexOfAscii(buf: Uint8Array, s: string): number {
    const needle = Buffer.from(s, "ascii");
    outer: for (let i = 0; i < buf.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (buf[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

function dumpVersionsNearDatabase(buf: Uint8Array) {
    // Find "DATABASE" then dump following length-prefixed ASCII strings heuristically
    const idx = indexOfAscii(buf, "DATABASE");
    if (idx < 0) return [];
    const stream = new ReplayStream(buf);
    stream.seek(idx);
    // chunk header: 8 type, u32 ver, u32 len, u32 namelen, 8 pad, name?
    stream.readASCIIStr(8);
    const version = stream.readUInt32();
    const chunkLength = stream.readUInt32();
    const nameLen = stream.readUInt32();
    stream.skip(8);
    if (nameLen) stream.skip(nameLen);
    const dataStart = stream.position;
    const end = dataStart + chunkLength;
    stream.skip(41); // to replayName
    const nameLen2 = stream.readUInt32();
    stream.skip(nameLen2 * 2);
    stream.skip(8);
    stream.readUInt32(); // vpGame
    stream.skip(23);
    const strings: string[] = [];
    const readLP = () => {
        if (stream.position + 4 > end) return null;
        const n = stream.readUInt32();
        if (n < 0 || n > 200 || stream.position + n > end) return null;
        return stream.readASCIIStr(n);
    };
    // gameminorversion
    const a = readLP();
    if (a) strings.push(a);
    stream.skip(4);
    const b = readLP();
    if (b) strings.push(b);
    stream.skip(8);
    if (stream.readUInt32() === 2) {
        const c = readLP();
        if (c) strings.push(`gameversion:${c}`);
        const d = readLP();
        if (d) strings.push(`date:${d}`);
    }
    const e = readLP();
    if (e) strings.push(`matchkey:${e}`);
    return { chunkVersion: version, strings };
}

const targets = [
    "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec",
    "replay_bznk6qkkzf_pcladdt4mp.rec",
    "fixtures/2p_angoville.rec",
];

const playbackDirs = [
    join(process.env.USERPROFILE!, "Documents", "My Games", "Company of Heroes Relaunch", "playback"),
    join(process.env.USERPROFILE!, "Documents", "My Games", "Company of Heroes", "playback"),
];

for (const dir of playbackDirs) {
    console.log("\nplayback:", dir, "exists:", existsSync(dir));
    if (!existsSync(dir)) continue;
    const recs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".rec"));
    console.log("count:", recs.length, "sample:", recs.slice(0, 8));
    for (const f of recs.slice(0, 3)) {
        const buf = stripReplayMetadata(new Uint8Array(readFileSync(join(dir, f))));
        const h = parseHeader(buf);
        const db = dumpVersionsNearDatabase(buf);
        console.log(" -", f, {
            name: h.replayName,
            mod: h.modName,
            date: h.gameDate,
            db,
        });
    }
}

for (const f of targets) {
    if (!existsSync(f)) continue;
    const buf = stripReplayMetadata(new Uint8Array(readFileSync(f)));
    console.log("\nFILE", f);
    console.log(dumpVersionsNearDatabase(buf));
    console.log(readGameVersions(buf));
}
