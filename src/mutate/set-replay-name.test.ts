import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
    embedPlayerSteamIds,
    parseHeader,
    parseReplay,
    setReplayName,
} from "../index";

const fixturesDir = path.resolve(__dirname, "../../fixtures");
const mainFixture = path.join(fixturesDir, "replay_rj5d3iuirq.rec");

const readFixture = (filePath: string) =>
    new Uint8Array(fs.readFileSync(filePath));

describe("setReplayName", () => {
    it("round-trips a longer replay name", () => {
        const original = readFixture(mainFixture);
        const before = parseHeader(original);
        const newName = `${before.header.replayName} — custom longer title`;

        const rewritten = setReplayName(original, newName);
        const after = parseHeader(rewritten);

        expect(after.meta.warnings).toEqual([]);
        expect(after.header.replayName).toBe(newName);
        expect(after.header.mapName).toBe(before.header.mapName);
        expect(after.players.length).toBe(before.players.length);
        expect(after.header.matchType).toBe(before.header.matchType);
    });

    it("round-trips a shorter replay name", () => {
        const original = readFixture(mainFixture);
        const before = parseHeader(original);
        const lengthened = setReplayName(
            original,
            "A fairly long custom replay title",
        );

        const rewritten = setReplayName(lengthened, "X");
        const after = parseHeader(rewritten);

        expect(after.meta.warnings).toEqual([]);
        expect(after.header.replayName).toBe("X");
        expect(after.header.mapFileName).toBe(before.header.mapFileName);
        expect(after.players.map((p) => p.name)).toEqual(
            before.players.map((p) => p.name),
        );
    });

    it("allows an empty replay name", () => {
        const original = readFixture(mainFixture);
        const rewritten = setReplayName(original, "");
        const after = parseHeader(rewritten);

        expect(after.meta.warnings).toEqual([]);
        expect(after.header.replayName).toBe("");
    });

    it("keeps parseReplay action stream intact after rename", () => {
        const original = readFixture(mainFixture);
        const before = parseReplay(original);
        const rewritten = setReplayName(original, "Renamed for actions test");
        const after = parseReplay(rewritten);

        expect(after.meta.warnings).toEqual([]);
        expect(after.header.replayName).toBe("Renamed for actions test");
        expect(after.actions.length).toBe(before.actions.length);
        expect(after.chat.length).toBe(before.chat.length);
    });

    it("preserves an existing FKSTMETA trailer across rename", () => {
        const original = readFixture(mainFixture);
        const withIds = embedPlayerSteamIds(original, {
            FCMpex: "76561198000000001",
            "Brutal Hummel": "76561198000000002",
        });

        const renamed = setReplayName(withIds, "Steam trailer kept");
        const replay = parseReplay(renamed);

        expect(replay.meta.warnings).toEqual([]);
        expect(replay.header.replayName).toBe("Steam trailer kept");
        expect(replay.players[0]!.steamId).toBe("76561198000000001");
        expect(replay.players[1]!.steamId).toBe("76561198000000002");
        expect(replay.actions.length).toBeGreaterThan(500);
    });
});
