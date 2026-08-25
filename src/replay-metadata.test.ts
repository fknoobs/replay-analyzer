import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
    embedPlayerSteamIds,
    extractReplayMetadata,
    stripReplayMetadata,
} from "../src/replay-metadata";
import { parseHeader, parseReplay } from "../src/replay-parser";

const fixturesDir = path.resolve(__dirname, "../fixtures");
const mainFixture = path.join(fixturesDir, "replay_rj5d3iuirq.rec");

const readFixture = (filePath: string) => new Uint8Array(fs.readFileSync(filePath));

describe("replay metadata trailer", () => {
    it("returns the original body when no trailer is present", () => {
        const original = readFixture(mainFixture);
        const extracted = extractReplayMetadata(original);

        expect(extracted.metadata).toBeNull();
        expect(extracted.body).toEqual(original);
    });

    it("round-trips steam IDs through embed + extract", () => {
        const original = readFixture(mainFixture);
        const map = {
            FCMpex: "76561198000000001",
            "Brutal Hummel": "76561198000000002",
        };

        const embedded = embedPlayerSteamIds(original, map);
        expect(embedded.length).toBeGreaterThan(original.length);

        const extracted = extractReplayMetadata(embedded);
        expect(extracted.body.length).toBe(original.length);
        expect(extracted.body).toEqual(original);
        expect(extracted.metadata?.steamIdsByName).toEqual(map);
    });

    it("replaces an existing trailer instead of stacking", () => {
        const original = readFixture(mainFixture);
        const first = embedPlayerSteamIds(original, { FCMpex: "1" });
        const second = embedPlayerSteamIds(first, {
            FCMpex: "76561198000000001",
            "Brutal Hummel": "76561198000000002",
        });

        const stripped = stripReplayMetadata(second);
        expect(stripped).toEqual(original);

        const extracted = extractReplayMetadata(second);
        expect(extracted.metadata?.steamIdsByName).toEqual({
            FCMpex: "76561198000000001",
            "Brutal Hummel": "76561198000000002",
        });
    });

    it("applies embedded steam IDs during parseReplay", () => {
        const original = readFixture(mainFixture);
        const embedded = embedPlayerSteamIds(original, {
            fcmpex: "76561198000000001",
            " Brutal Hummel ": "76561198000000002",
        });

        const replay = parseReplay(embedded);
        expect(replay.errors).toEqual([]);
        expect(replay.players[0].steamId).toBe("76561198000000001");
        expect(replay.players[1].steamId).toBe("76561198000000002");
        // Body parse still works with trailer present
        expect(replay.actions.length).toBeGreaterThan(500);
    });

    it("applies embedded steam IDs during parseHeader", () => {
        const original = readFixture(mainFixture);
        const embedded = embedPlayerSteamIds(original, {
            FCMpex: "76561198000000001",
        });

        const replay = parseHeader(embedded);
        expect(replay.headerParsed).toBe(true);
        expect(replay.players[0].steamId).toBe("76561198000000001");
        expect(replay.players[1].steamId).toBeUndefined();
    });

    it("ignores empty steam IDs when embedding", () => {
        const original = readFixture(mainFixture);
        const embedded = embedPlayerSteamIds(original, {
            FCMpex: "76561198000000001",
            "Brutal Hummel": "  ",
        });

        const extracted = extractReplayMetadata(embedded);
        expect(extracted.metadata?.steamIdsByName).toEqual({
            FCMpex: "76561198000000001",
        });
    });
});
