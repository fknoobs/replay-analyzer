import { readFileSync } from "fs";
import { stripReplayMetadata } from "../src/index";

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

function dump(label: string, path: string) {
    const body = stripReplayMetadata(new Uint8Array(readFileSync(path)));
    const idx = indexOf(body, "DATABASE");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 8 + 4 + 4 + 4 + 8 + nameLen;
    const namePos = dataStart + 41;
    const nameChars = view.getUint32(namePos, true);
    const afterName = namePos + 4 + nameChars * 2;
    const rest = body.subarray(afterName, dataStart + chunkLen);

    console.log("\n===", label, "===");
    console.log("chunkLen", chunkLen, "nameChars", nameChars, "restLen", rest.length);
    console.log("full DATABASE payload hex:");
    const payload = body.subarray(dataStart, dataStart + chunkLen);
    for (let i = 0; i < payload.length; i += 16) {
        const chunk = [...payload.subarray(i, i + 16)];
        const h = chunk.map((b) => b.toString(16).padStart(2, "0")).join(" ");
        const a = chunk
            .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
            .join("");
        console.log(i.toString(16).padStart(4, "0") + "  " + h.padEnd(48) + "  " + a);
    }

    // Also DATASDSC modName region
    const sdsc = indexOf(body, "DATASDSC");
    if (sdsc >= 0) {
        const sVer = view.getUint32(sdsc + 8, true);
        const sLen = view.getUint32(sdsc + 12, true);
        const sNameLen = view.getUint32(sdsc + 16, true);
        const sData = sdsc + 8 + 4 + 4 + 4 + 8 + sNameLen;
        console.log("DATASDSC ver", sVer, "len", sLen);
        console.log(
            "SDSC first 80:",
            Buffer.from(body.subarray(sData, sData + 80)).toString("hex"),
        );
    }
}

dump("BROKEN cleaned", "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec");
dump("OK bznk", "replay_bznk6qkkzf_pcladdt4mp.rec");
dump("OK rj5d", "fixtures/replay_rj5d3iuirq.rec");
dump(
    "OK zip langres",
    process.env.TEMP +
        "\\coh-playback-zip\\playback\\2p_langres.2025-12-08.01-05-31.rec",
);
