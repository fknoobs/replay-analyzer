import { readFileSync } from "fs";
import { stripReplayMetadata, parseHeader } from "../src/index";
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

function dumpSdsc(path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const h = parseHeader(body);
    const idx = indexOf(body, "DATASDSC");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const ver = view.getUint32(idx + 8, true);
    const len = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 8 + 4 + 4 + 4 + 8 + nameLen;
    const stream = new ReplayStream(body);
    stream.seek(dataStart);
    stream.skip(4);
    const len2 = stream.readUInt32();
    const maybeDate = stream.readUnicodeStr(len2); // speculative
    stream.skip(12);
    // Actually use parser layout:
    stream.seek(dataStart);
    stream.skip(4);
    const l = stream.readUInt32();
    stream.skip(12 + 2 * l);
    const modName = stream.readLengthPrefixedASCIIStr();
    const mapFileName = stream.readLengthPrefixedASCIIStr();
    stream.skip(20);
    const mapName = stream.readLengthPrefixedUnicodeStr();
    const mapDesc = stream.readLengthPrefixedUnicodeStr();
    console.log({
        path,
        parsedMap: h.mapName,
        modName,
        mapFileName,
        mapName,
        mapDesc: mapDesc.slice(0, 80),
        sdscDateGuess: maybeDate,
    });
}

dumpSdsc("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec");
dumpSdsc("replay_bznk6qkkzf_pcladdt4mp.rec");
dumpSdsc(
    process.env.TEMP +
        "\\coh-playback-zip\\playback\\2p_langres.2025-12-08.01-05-31.rec",
);

// Search for .sgb in broken file
const body = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const ascii = Buffer.from(body.subarray(0, 5000)).toString("latin1");
const m = ascii.match(/[\x20-\x7E]*\.sgb/gi);
console.log("sgb refs", m);
const m2 = ascii.match(/DATA:[^\x00]{0,120}/g);
console.log("DATA refs", m2);
