import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { stripReplayMetadata, parseHeader, parseReplay } from "../src/index";

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

function databaseTail(label: string, buf: Uint8Array) {
    const body = stripReplayMetadata(buf);
    const idx = indexOf(body, "DATABASE");
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataStart = idx + 8 + 4 + 4 + 4 + 8 + nameLen;
    const dataEnd = dataStart + chunkLen;
    const tail = body.subarray(dataEnd - 16, dataEnd);
    console.log(
        label,
        "chunkLen",
        chunkLen,
        "last16",
        Buffer.from(tail).toString("hex"),
        "lastByte",
        body[dataEnd - 1],
    );
    return { body, dataEnd };
}

const cleaned = new Uint8Array(
    readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
);
const { body, dataEnd } = databaseTail("broken", cleaned);
databaseTail(
    "control",
    new Uint8Array(
        readFileSync(
            join(
                process.env.USERPROFILE!,
                "Documents",
                "My Games",
                "Company of Heroes Relaunch",
                "playback",
                "control_langres_ok.rec",
            ),
        ),
    ),
);
databaseTail(
    "bznk",
    new Uint8Array(readFileSync("replay_bznk6qkkzf_pcladdt4mp.rec")),
);

const patched = body.slice();
patched[dataEnd - 1] = 1;

const h = parseHeader(patched);
const full = parseReplay(patched);
console.log({
    map: h.mapName,
    matchType: h.matchType,
    duration: full.duration,
    actions: full.actions.length,
    errors: full.errors,
    lastByte: patched[dataEnd - 1],
});

const pb = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);

const keep = new Set([
    "aaa_control_langres_ok.rec",
    "control_langres_ok.rec",
    "control_renamed_by_us.rec",
    "bznk_stripped_ok.rec",
    "vire_flag_fix.rec",
    "vire_clean_only.rec",
]);

writeFileSync(join(pb, "vire_flag_fix.rec"), patched);
writeFileSync(join(pb, "vire_clean_only.rec"), body);
writeFileSync("vire_flag_fix.rec", patched);

for (const f of readdirSync(pb)) {
    if (!f.endsWith(".rec")) continue;
    if (!keep.has(f)) {
        try {
            unlinkSync(join(pb, f));
        } catch {
            /* ignore */
        }
    }
}

console.log(
    "playback now:",
    readdirSync(pb).filter((f) => f.endsWith(".rec")),
);
