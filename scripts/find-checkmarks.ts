import { readFileSync } from "fs";
import { stripReplayMetadata } from "../src/index";

const body = stripReplayMetadata(
    new Uint8Array(
        readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"),
    ),
);
const hits: { i: number; around: string }[] = [];
for (let i = 0; i < body.length - 1; i++) {
    if (body[i] === 0x13 && body[i + 1] === 0x27) {
        const slice = body.subarray(Math.max(0, i - 40), i + 40);
        // interpret as mixed - show hex + try utf16 around even offset
        const start = i - (i % 2);
        let utf = "";
        for (let j = Math.max(0, start - 30); j < start + 30; j += 2) {
            const c = body[j] | (body[j + 1] << 8);
            utf += c >= 32 && c < 0xd800 ? String.fromCharCode(c) : "·";
        }
        hits.push({ i, around: utf });
    }
}
console.log("checkmark count", hits.length);
console.log(hits);
