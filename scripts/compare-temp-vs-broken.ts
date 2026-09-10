import { readFileSync, existsSync } from "fs";
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

function dumpSdsc(label: string, path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const idx = indexOf(body, "DATASDSC");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 28 + nameLen;
    const stream = new ReplayStream(body);
    stream.seek(dataStart);
    const u0 = stream.readUInt32();
    const dateChars = stream.readUInt32();
    const date = stream.readUnicodeStr(dateChars);
    stream.skip(12);
    const modLen = stream.readUInt32();
    const mod = stream.readASCIIStr(modLen);
    const mapFileLen = stream.readUInt32();
    const mapFile = stream.readASCIIStr(mapFileLen);
    const mid20 = Buffer.from(
        body.subarray(stream.position, stream.position + 20),
    ).toString("hex");
    stream.skip(20);
    const mapNameChars = stream.readUInt32();
    const mapName = stream.readUnicodeStr(mapNameChars);
    const descChars = stream.readUInt32();
    const desc = stream.readUnicodeStr(Math.min(descChars, 60));

    const db = indexOf(body, "DATABASE");
    const dbLen = view.getUint32(db + 12, true);
    const dbNameLen = view.getUint32(db + 16, true);
    const dbStart = db + 28 + dbNameLen;
    const dbEnd = dbStart + dbLen;
    const dbTail = Buffer.from(body.subarray(dbEnd - 12, dbEnd)).toString(
        "hex",
    );

    console.log({
        label,
        size: body.length,
        fileDate: rawDate(body),
        sdsc: {
            chunkLen,
            u0,
            date,
            mod,
            mapFile: JSON.stringify(mapFile),
            mid20,
            mapName: JSON.stringify(mapName),
            descChars,
            desc: JSON.stringify(desc),
        },
        database: { dbLen, last12: dbTail, lastByte: body[dbEnd - 1] },
    });
}

const broken = existsSync(
    "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec",
)
    ? "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"
    : "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.reset (2).rec";

dumpSdsc("temp.rec (works)", "temp.rec");
dumpSdsc("broken", broken);

// Hex-diff first differences in DATASDSC payloads
function sdscPayload(path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const idx = indexOf(body, "DATASDSC");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 28 + nameLen;
    return body.subarray(dataStart, dataStart + chunkLen);
}

const a = sdscPayload("temp.rec");
const b = sdscPayload(broken);
console.log("\nSDSC len temp", a.length, "broken", b.length);
const min = Math.min(a.length, b.length);
let firstDiff = -1;
for (let i = 0; i < min; i++) {
    if (a[i] !== b[i]) {
        firstDiff = i;
        break;
    }
}
console.log("first SDSC byte diff at", firstDiff);
if (firstDiff >= 0) {
    console.log(
        "temp around",
        Buffer.from(a.subarray(firstDiff, firstDiff + 32)).toString("hex"),
    );
    console.log(
        "brok around",
        Buffer.from(b.subarray(firstDiff, firstDiff + 32)).toString("hex"),
    );
}

// Are they identical SDSC?
let same = a.length === b.length;
if (same) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) same = false;
}
console.log("identical DATASDSC?", same);
