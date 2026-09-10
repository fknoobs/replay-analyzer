import { readFileSync, writeFileSync, existsSync } from "fs";
import {
    hasReplayMetadataTrailer,
    parseHeader,
    parseReplay,
    setReplayName,
    stripReplayMetadata,
} from "../src/index";

function summarize(label: string, path: string) {
    if (!existsSync(path)) {
        console.log(label, "MISSING", path);
        return;
    }
    const buf = new Uint8Array(readFileSync(path));
    const header = parseHeader(buf);
    const full = parseReplay(buf);
    console.log({
        label,
        size: buf.length,
        trailer: hasReplayMetadataTrailer(buf),
        replayName: JSON.stringify(header.replayName),
        replayNameLen: header.replayName.length,
        map: header.mapName,
        modName: header.modName,
        gameDate: header.gameDate,
        matchType: header.matchType,
        duration: full.duration,
        actions: full.actions.length,
        dataParsed: full.dataParsed,
        errors: full.errors,
        players: header.players.map((p) => p.name),
        asciiStart: Buffer.from(buf.subarray(0, 64)).toString("latin1"),
    });
}

const files: [string, string][] = [
    ["broken", "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.reset (2).rec"],
    ["cleaned", "replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.cleaned.rec"],
    ["good-other", "replay_bznk6qkkzf_pcladdt4mp.rec"],
    ["fixture", "fixtures/2p_angoville.rec"],
];

for (const [label, path] of files) {
    summarize(label, path);
}

const broken = new Uint8Array(
    readFileSync("replay_1hza0r9gj9_re2zbi5vkd_9ouqspcnhu.reset (2).rec"),
);
const body = stripReplayMetadata(broken);
const named = setReplayName(body, "Vire River reset");
writeFileSync("replay_vire_river_for_coh.rec", named);
summarize("named-for-coh", "replay_vire_river_for_coh.rec");
