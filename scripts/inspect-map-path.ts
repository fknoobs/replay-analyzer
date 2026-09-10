import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { stripReplayMetadata } from "../src/index";
import { ReplayStream } from "../src/replay-stream";

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

function readSdscFields(path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const idx = indexOf(body, "DATASDSC");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 8 + 4 + 4 + 4 + 8 + nameLen;
    const stream = new ReplayStream(body);
    stream.seek(dataStart);
    const u0 = stream.readUInt32();
    const dateChars = stream.readUInt32();
    const date = stream.readUnicodeStr(dateChars);
    stream.skip(12);
    const modLen = stream.readUInt32();
    const modName = stream.readASCIIStr(modLen);
    const mapFileLen = stream.readUInt32();
    const mapFileBytes = body.subarray(stream.position, stream.position + mapFileLen);
    const mapFileName = stream.readASCIIStr(mapFileLen);
    stream.skip(20);
    const mapNameChars = stream.readUInt32();
    const mapName = stream.readUnicodeStr(mapNameChars);
    console.log({
        path: path.split(/[/\\]/).pop(),
        chunkLen,
        u0,
        date,
        modLen,
        modName: JSON.stringify(modName),
        mapFileLen,
        mapFileName: JSON.stringify(mapFileName),
        mapFileHex: Buffer.from(mapFileBytes).toString("hex"),
        mapNameChars,
        mapName: JSON.stringify(mapName),
        posAfter: stream.position,
        dataEnd: dataStart + chunkLen,
    });
}

readSdscFields("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec");
readSdscFields("replay_bznk6qkkzf_pcladdt4mp.rec");

// Find the map on disk
const roots = [
    join(process.env.USERPROFILE!, "Documents", "My Games", "Company of Heroes Relaunch"),
    "D:\\SteamLibrary\\steamapps\\common\\Company of Heroes Relaunch",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Company of Heroes Relaunch",
];

function walkFind(dir: string, pred: (n: string) => boolean, hits: string[], depth = 0) {
    if (depth > 6 || hits.length > 20 || !existsSync(dir)) return;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (pred(e.name)) hits.push(p);
        if (e.isDirectory()) walkFind(p, pred, hits, depth + 1);
    }
}

const hits: string[] = [];
for (const r of roots) {
    walkFind(r, (n) => /vire/i.test(n), hits);
}
console.log("vire hits:", hits);
