import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { stripReplayMetadata, parseHeader, setReplayName } from "../src/index";
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

function analyzeDatabase(label: string, buf: Uint8Array) {
    const body = stripReplayMetadata(buf);
    const idx = indexOf(body, "DATABASE");
    if (idx < 0) {
        console.log(label, "no DATABASE");
        return;
    }
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkVer = view.getUint32(idx + 8, true);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 8 + 4 + 4 + 4 + 8 + nameLen;
    const dataEnd = dataStart + chunkLen;
    const header = parseHeader(body);

    // Validate: after DATABASE data, next should be another FOLD/DATA or end of parent
    const after = body.subarray(dataEnd, dataEnd + 8);
    const afterAscii = Buffer.from(after).toString("ascii");

    // Find replayName using official locator logic (41 bytes)
    const namePos = dataStart + 41;
    const nameChars = view.getUint32(namePos, true);
    let name = "";
    if (nameChars > 0 && nameChars < 200) {
        const chars: number[] = [];
        for (let i = 0; i < nameChars; i++) {
            chars.push(view.getUint16(namePos + 4 + i * 2, true));
        }
        name = String.fromCharCode(...chars);
    }

    // Check parent FOLDINFO size consistency roughly
    const foldInfo = indexOf(body, "FOLDINFO");
    let foldInfoLen: number | null = null;
    let foldInfoEnd: number | null = null;
    if (foldInfo >= 0) {
        foldInfoLen = view.getUint32(foldInfo + 12, true);
        const foldNameLen = view.getUint32(foldInfo + 16, true);
        const foldDataStart = foldInfo + 8 + 4 + 4 + 4 + 8 + foldNameLen;
        foldInfoEnd = foldDataStart + foldInfoLen;
    }

    console.log({
        label,
        size: body.length,
        replayNameParsed: JSON.stringify(header.replayName),
        modName: header.modName,
        dateRaw: (() => {
            const s = new ReplayStream(body);
            s.seek(12);
            let n = 0;
            const p = s.position;
            while (s.readUInt16() !== 0) n++;
            s.seek(p);
            return s.readUnicodeStr(n);
        })(),
        database: { idx, chunkVer, chunkLen, dataStart, dataEnd, afterAscii: JSON.stringify(afterAscii) },
        nameAt41: { namePos, nameChars, name: JSON.stringify(name) },
        foldInfo: { foldInfo, foldInfoLen, foldInfoEnd, containsDbEnd: foldInfoEnd != null && dataEnd <= foldInfoEnd! },
        first32version: view.getUint32(0, true),
    });

    // Dump first 96 bytes of DATABASE payload as ascii/hex mix
    const slice = body.subarray(dataStart, dataStart + Math.min(chunkLen, 96));
    console.log(
        "  payload:",
        [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join(""),
    );
}

const files = [
    "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec",
    "vire_river_8p.rec",
    "replay_bznk6qkkzf_pcladdt4mp.rec",
    "fixtures/2p_angoville.rec",
    "fixtures/replay_rj5d3iuirq.rec",
];

const zipDir = join(process.env.TEMP!, "coh-playback-zip");
if (existsSync(zipDir)) {
    for (const f of readdirSync(zipDir)) {
        if (f.endsWith(".rec")) files.push(join(zipDir, f));
    }
}

// Also any rec in playback
const pb = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);
if (existsSync(pb)) {
    for (const f of readdirSync(pb)) {
        if (f.endsWith(".rec")) files.push(join(pb, f));
    }
}

for (const f of files) {
    if (!existsSync(f)) continue;
    analyzeDatabase(f, new Uint8Array(readFileSync(f)));
}

// Round-trip: setReplayName empty->X->empty on cleaned, compare
const cleaned = stripReplayMetadata(
    new Uint8Array(readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec")),
);
const renamed = setReplayName(cleaned, "Test");
const back = setReplayName(renamed, "");
console.log(
    "roundtrip empty->Test->empty equal?",
    cleaned.length === back.length && cleaned.every((b, i) => b === back[i]),
    "sizes",
    cleaned.length,
    renamed.length,
    back.length,
);
