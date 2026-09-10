import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import {
    parseHeader,
    setReplayName,
    stripReplayMetadata,
} from "../src/index";
import { ReplayStream } from "../src/replay-stream";

const src = "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec";
const body = stripReplayMetadata(new Uint8Array(readFileSync(src)));

// Hex dump DATABASE payload around replayName + version keys
function dumpDatabase(buf: Uint8Array) {
    const idx = indexOf(buf, "DATABASE");
    const stream = new ReplayStream(buf);
    stream.seek(idx);
    stream.readASCIIStr(8);
    const ver = stream.readUInt32();
    const len = stream.readUInt32();
    const nameLen = stream.readUInt32();
    stream.skip(8);
    if (nameLen) stream.skip(nameLen);
    const dataStart = stream.position;
    const slice = buf.subarray(dataStart, dataStart + Math.min(len, 400));
    console.log("DATABASE ver", ver, "len", len, "dataStart", dataStart);
    console.log(hex(slice, 400));
    // interpret
    stream.seek(dataStart);
    console.log("u32", stream.readUInt32(), stream.readUInt32()); // 8
    console.log("u32", stream.readUInt32(), stream.readUInt32()); // 8
    console.log("randomStart raw", stream.readUInt32());
    console.log("skip", stream.readUInt32());
    console.log("highRes", stream.readUInt32());
    console.log("skip", stream.readUInt32());
    console.log("vpVal", stream.readUInt32());
    console.log("5bytes", [...buf.subarray(stream.position, stream.position + 5)]);
    stream.skip(5);
    const nc = stream.readUInt32();
    console.log("nameChars", nc);
    if (nc) console.log("name", stream.readUnicodeStr(nc));
    console.log("next8", [...buf.subarray(stream.position, stream.position + 8)]);
    stream.skip(8);
    console.log("vpGame", stream.readUInt32().toString(16));
    console.log("next23", [...buf.subarray(stream.position, stream.position + 23)]);
    stream.skip(23);
    // dump remaining LP strings until end of chunk
    const end = dataStart + len;
    let i = 0;
    while (stream.position + 4 <= end && i < 20) {
        const pos = stream.position;
        const n = stream.readUInt32();
        if (n < 0 || n > 300 || stream.position + n > end) {
            console.log("stop at", pos, "n", n);
            break;
        }
        const s = stream.readASCIIStr(n);
        console.log(`LP@${pos} len=${n}`, JSON.stringify(s));
        i++;
    }
}

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

function hex(buf: Uint8Array, max: number) {
    const lines: string[] = [];
    for (let i = 0; i < Math.min(buf.length, max); i += 16) {
        const chunk = [...buf.subarray(i, i + 16)];
        const h = chunk.map((b) => b.toString(16).padStart(2, "0")).join(" ");
        const a = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
        lines.push(i.toString(16).padStart(4, "0") + "  " + h.padEnd(48) + "  " + a);
    }
    return lines.join("\n");
}

dumpDatabase(body);

const named = setReplayName(body, "Vire River 8p");
const playback = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);
const outName = "vire_river_8p.rec";
writeFileSync(join(playback, outName), named);
writeFileSync(outName, named);
console.log("wrote", outName, "size", named.length, "name", JSON.stringify(parseHeader(named).replayName));
