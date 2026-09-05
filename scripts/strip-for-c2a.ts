import fs from "fs";
import { extractReplayMetadata } from "../src/replay-metadata";

const raw = new Uint8Array(
    fs.readFileSync("./replay_bznk6qkkzf_pcladdt4mp.rec"),
);
const { body, metadata } = extractReplayMetadata(raw);
console.log({
    rawLen: raw.length,
    bodyLen: body.length,
    metadata,
    tailAscii: Buffer.from(raw.slice(-40)).toString("latin1"),
});
fs.mkdirSync("./tmp-gr", { recursive: true });
fs.writeFileSync("./tmp-gr/problem-stripped.rec", body);
console.log("wrote", body.length, "bytes");
