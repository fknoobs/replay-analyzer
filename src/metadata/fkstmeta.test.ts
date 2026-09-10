import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
    embedPlayerIds,
    embedPlayerSteamIds,
    embedReplayMetadata,
    extractReplayMetadata,
    hasReplayMetadata,
    hasReplayMetadataTrailer,
    parseHeader,
    parseReplay,
    resetReplayMetadata,
    setReplayName,
    stripReplayMetadata,
} from "../index";

const fixturesDir = path.resolve(__dirname, "../../fixtures");
const mainFixture = path.join(fixturesDir, "replay_rj5d3iuirq.rec");
const badc0deFixture = path.join(fixturesDir, "matchtype_badc0de_header.rec");

const readFixture = (filePath: string) =>
    new Uint8Array(fs.readFileSync(filePath));

describe("replay metadata trailer", () => {
    it("returns the original body when no trailer is present", () => {
        const original = readFixture(mainFixture);
        const extracted = extractReplayMetadata(original);

        expect(extracted.metadata).toBeNull();
        expect(hasReplayMetadata(original)).toBe(false);
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
        expect(hasReplayMetadata(embedded)).toBe(true);

        const extracted = extractReplayMetadata(embedded);
        expect(extracted.body.length).toBe(original.length);
        expect(extracted.body).toEqual(original);
        expect(extracted.metadata?.steamIdsByName).toEqual(map);
        expect(extracted.metadata?.playerIdsByName).toEqual({});
    });

    it("round-trips player IDs and preserves steam IDs", () => {
        const original = readFixture(mainFixture);
        const withSteam = embedPlayerSteamIds(original, {
            FCMpex: "76561198000000001",
        });
        const withBoth = embedPlayerIds(withSteam, {
            FCMpex: 1000,
            "Brutal Hummel": 1001,
        });

        const extracted = extractReplayMetadata(withBoth);
        expect(extracted.metadata?.steamIdsByName).toEqual({
            FCMpex: "76561198000000001",
        });
        expect(extracted.metadata?.playerIdsByName).toEqual({
            FCMpex: 1000,
            "Brutal Hummel": 1001,
        });
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

    it("resetReplayMetadata removes the trailer and clears steamIds on re-parse", () => {
        const original = readFixture(mainFixture);
        const embedded = embedPlayerSteamIds(original, {
            FCMpex: "76561198000000001",
            "Brutal Hummel": "76561198000000002",
        });

        const reset = resetReplayMetadata(embedded);
        expect(hasReplayMetadata(reset)).toBe(false);
        expect(reset).toEqual(original);
        expect(reset.buffer).not.toBe(embedded.buffer);

        const replay = parseReplay(reset);
        expect(replay.players.every((p) => p.steamId === undefined)).toBe(true);
        expect(replay.actions.length).toBeGreaterThan(500);
    });

    it("strips a framed trailer even when JSON is corrupt", () => {
        const original = readFixture(mainFixture);
        const good = embedPlayerSteamIds(original, { FCMpex: "1" });
        const broken = good.slice();
        const view = new DataView(
            broken.buffer,
            broken.byteOffset,
            broken.byteLength,
        );
        const jsonLength = view.getUint32(broken.length - 16, true);
        const jsonStart = broken.length - 16 - jsonLength;
        broken[jsonStart] = 0x7b;
        broken[jsonStart + 1] = 0x00;

        expect(hasReplayMetadata(broken)).toBe(false);
        expect(hasReplayMetadataTrailer(broken)).toBe(true);

        const stripped = stripReplayMetadata(broken);
        expect(stripped).toEqual(original);

        const reset = resetReplayMetadata(broken);
        expect(reset).toEqual(original);
        expect(parseReplay(reset).actions.length).toBeGreaterThan(500);
    });

    it("setReplayName + embed + reset body equals renamed body only", () => {
        const original = readFixture(mainFixture);
        const renamed = setReplayName(original, "Custom title");
        const embedded = embedPlayerSteamIds(renamed, {
            FCMpex: "76561198000000001",
        });
        const reset = resetReplayMetadata(embedded);
        expect(reset).toEqual(renamed);
        expect(hasReplayMetadata(reset)).toBe(false);
        const pristine = original.slice();
        expect(pristine).toEqual(original);
    });

    it("applies embedded steam IDs during parseReplay", () => {
        const original = readFixture(mainFixture);
        const embedded = embedPlayerSteamIds(original, {
            fcmpex: "76561198000000001",
            " Brutal Hummel ": "76561198000000002",
        });

        const replay = parseReplay(embedded);
        expect(replay.meta.warnings).toEqual([]);
        expect(replay.players[0]!.steamId).toBe("76561198000000001");
        expect(replay.players[1]!.steamId).toBe("76561198000000002");
        expect(replay.actions.length).toBeGreaterThan(500);
    });

    it("applies embedded player IDs during parseReplay", () => {
        const original = readFixture(mainFixture);
        const embedded = embedReplayMetadata(original, {
            steamIdsByName: {},
            playerIdsByName: {
                FCMpex: 1001,
                "Brutal Hummel": 1000,
            },
        });

        const replay = parseReplay(embedded);
        expect(replay.players[0]!.id).toBe(1001);
        expect(replay.players[1]!.id).toBe(1000);
    });

    it("applies embedded steam IDs during parseHeader", () => {
        const original = readFixture(mainFixture);
        const embedded = embedPlayerSteamIds(original, {
            FCMpex: "76561198000000001",
        });

        const replay = parseHeader(embedded);
        expect(replay.meta.headerOk).toBe(true);
        expect(replay.players[0]!.steamId).toBe("76561198000000001");
        expect(replay.players[1]!.steamId).toBeUndefined();
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

describe("0xBADC0DE Replay Manager blob", () => {
    it("parses ladder players and applies MPN + Steam on header parse", () => {
        const replay = parseHeader(readFixture(badc0deFixture));
        expect(replay.meta.warnings).toEqual([]);
        expect(replay.header.matchType).toBe("");
        expect(replay.ladder).toHaveLength(4);

        expect(replay.players[0]!.name).toBe("Wilmar_Marquetti");
        expect(replay.players[0]!.id).toBe(1001);
        expect(replay.players[1]!.id).toBe(1000);
        expect(replay.players[2]!.id).toBe(1002);
        expect(replay.players[3]!.id).toBe(1003);

        expect(replay.players[0]!.steamId).toBe("76561198049286501");
        for (const p of replay.players) {
            expect(p.steamId).toMatch(/^\d+$/);
            expect(p.steamId).not.toBe("0");
        }
    });
});
