import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseHeader, stripReplayMetadata } from "../src/index";

const pb = join(
    process.env.USERPROFILE!,
    "Documents",
    "My Games",
    "Company of Heroes Relaunch",
    "playback",
);

function rawDate(buf: Uint8Array): string {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let n = 0;
    while (view.getUint16(12 + n * 2, true) !== 0) n++;
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint16(12 + i * 2, true));
    return s;
}

function setRawDate(buf: Uint8Array, date: string): Uint8Array {
    const out = buf.slice();
    const old = rawDate(out);
    if (date.length !== old.length) {
        throw new Error(`need ${old.length} chars, got ${date.length}: ${JSON.stringify(date)}`);
    }
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < date.length; i++) {
        view.setUint16(12 + i * 2, date.charCodeAt(i), true);
    }
    return out;
}

function replaceAscii(buf: Uint8Array, from: string, to: string): Uint8Array {
    if (from.length !== to.length) throw new Error("same length required");
    const out = buf.slice();
    const needle = Buffer.from(from, "ascii");
    outer: for (let i = 0; i < out.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (out[i + j] !== needle[j]) continue outer;
        }
        for (let j = 0; j < to.length; j++) out[i + j] = to.charCodeAt(j);
        return out;
    }
    throw new Error(`not found: ${from}`);
}

const control = stripReplayMetadata(
    new Uint8Array(readFileSync(join(pb, "control_langres_ok.rec"))),
);
console.log("control raw date", JSON.stringify(rawDate(control)), "len", rawDate(control).length);
console.log("control header", parseHeader(control).modName, parseHeader(control).matchType);

// A: ISO-like date same length as control date
const d = rawDate(control);
// Build ISO-ish string of same length
let iso: string;
if (d.length === 16) iso = "2025-12-08 01:05";
else if (d.length === 19) iso = "2025-12-08 01:05:00";
else {
    // pad/truncate a template
    const base = "2025-12-08 01:05:00";
    iso = (base + " ".repeat(40)).slice(0, d.length);
}
const dateIso = setRawDate(control, iso);
writeFileSync(join(pb, "mut_A_iso_date.rec"), dateIso);
console.log("A iso date", JSON.stringify(rawDate(dateIso)));

// B: RelicCoH -> RelicCOH
const modCase = replaceAscii(control, "RelicCoH", "RelicCOH");
writeFileSync(join(pb, "mut_B_modcase.rec"), modCase);
console.log("B mod", parseHeader(modCase).modName);

// C: put a zero-flag GR duclair into playback
const duclair = join(
    process.env.TEMP!,
    "coh-playback-zip",
    "playback",
    "4p_duclair.2025-10-06.22-36-58.rec",
);
writeFileSync(
    join(pb, "mut_C_zerofill_duclair.rec"),
    stripReplayMetadata(new Uint8Array(readFileSync(duclair))),
);
console.log("C duclair", parseHeader(readFileSync(duclair)).mapName);

// D: vire with ONLY checkmark replaced (no other changes)
const vire = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const noCheck = vire.slice();
let replaced = 0;
for (let i = 0; i < noCheck.length - 1; i++) {
    if (noCheck[i] === 0x13 && noCheck[i + 1] === 0x27) {
        noCheck[i] = 0x78; // 'x'
        noCheck[i + 1] = 0x00;
        replaced++;
    }
}
writeFileSync(join(pb, "mut_D_vire_nocheck.rec"), noCheck);
console.log("D checkmarks replaced", replaced, "map", parseHeader(noCheck).mapName);

// E: vire ISO date -> slash EU same length (16)
const vireDate = setRawDate(vire, "08/09/2026 20:51");
writeFileSync(join(pb, "mut_E_vire_slashdate.rec"), vireDate);

// F: vire flag=1 (already have) + nocheck + slashdate + RelicCoH
let combo = setRawDate(vire, "08/09/2026 20:51");
combo = replaceAscii(combo, "RelicCOH", "RelicCoH");
for (let i = 0; i < combo.length - 1; i++) {
    if (combo[i] === 0x13 && combo[i + 1] === 0x27) {
        combo[i] = 0x78;
        combo[i + 1] = 0x00;
        break;
    }
}
// flag
{
    const idx = Buffer.from(combo).indexOf("DATABASE");
    const view = new DataView(combo.buffer, combo.byteOffset, combo.byteLength);
    const chunkLen = view.getUint32(idx + 12, true);
    const nameLen = view.getUint32(idx + 16, true);
    const dataEnd = idx + 28 + nameLen + chunkLen;
    combo[dataEnd - 1] = 1;
}
writeFileSync(join(pb, "mut_F_vire_combo.rec"), combo);
writeFileSync("mut_F_vire_combo.rec", combo);

console.log(
    "playback tests ready — open Game History and tell me which mut_* appear / which error in warnings.log",
);
console.log(
    readdirSync(pb)
        .filter(
            (f) =>
                f.startsWith("mut_") ||
                f.startsWith("control") ||
                f.startsWith("vire") ||
                f.startsWith("COH_") ||
                f.startsWith("bznk") ||
                f.startsWith("aaa_"),
        )
        .sort(),
);
