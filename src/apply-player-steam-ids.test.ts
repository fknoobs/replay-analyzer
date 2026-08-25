import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { applyPlayerSteamIds } from "../src/apply-player-steam-ids";
import { parseReplay } from "../src/replay-parser";
import { createEmptyReplay, type Player } from "../src/replay-types";

const fixturesDir = path.resolve(__dirname, "../fixtures");
const mainFixture = path.join(fixturesDir, "replay_rj5d3iuirq.rec");

const readFixture = (filePath: string) => new Uint8Array(fs.readFileSync(filePath));

const makePlayer = (name: string, overrides: Partial<Player> = {}): Player => ({
    name,
    faction: "allies",
    slot: 0,
    ...overrides,
});

describe("applyPlayerSteamIds", () => {
    it("matches on exact name", () => {
        const replay = createEmptyReplay();
        replay.players = [makePlayer("Alice"), makePlayer("Bob")];

        applyPlayerSteamIds(replay, { Alice: "76561198000000001" });

        expect(replay.players[0].steamId).toBe("76561198000000001");
        expect(replay.players[1].steamId).toBeUndefined();
    });

    it("matches case-insensitively and trims whitespace", () => {
        const replay = createEmptyReplay();
        replay.players = [makePlayer("  Alice  "), makePlayer("bob")];

        applyPlayerSteamIds(replay, {
            alice: "76561198000000001",
            " BOB ": "76561198000000002",
        });

        expect(replay.players[0].steamId).toBe("76561198000000001");
        expect(replay.players[1].steamId).toBe("76561198000000002");
    });

    it("leaves steamId undefined when there is no match", () => {
        const replay = createEmptyReplay();
        replay.players = [makePlayer("Alice")];

        applyPlayerSteamIds(replay, { Charlie: "76561198000000003" });

        expect(replay.players[0].steamId).toBeUndefined();
    });

    it("applies a partial map across multiple players", () => {
        const replay = createEmptyReplay();
        replay.players = [
            makePlayer("Alice", { slot: 0 }),
            makePlayer("Bob", { slot: 1 }),
            makePlayer("Carol", { slot: 2 }),
        ];

        applyPlayerSteamIds(replay, {
            Alice: "76561198000000001",
            Carol: "76561198000000003",
        });

        expect(replay.players.map((p) => p.steamId)).toEqual([
            "76561198000000001",
            undefined,
            "76561198000000003",
        ]);
    });

    it("assigns the same steamId to duplicate player names", () => {
        const replay = createEmptyReplay();
        replay.players = [makePlayer("Alice", { slot: 0 }), makePlayer("Alice", { slot: 1 })];

        applyPlayerSteamIds(replay, { Alice: "76561198000000001" });

        expect(replay.players[0].steamId).toBe("76561198000000001");
        expect(replay.players[1].steamId).toBe("76561198000000001");
    });

    it("mutates and returns the same replay reference", () => {
        const replay = createEmptyReplay();
        replay.players = [makePlayer("Alice")];

        const result = applyPlayerSteamIds(replay, { Alice: "76561198000000001" });

        expect(result).toBe(replay);
    });

    it("works on parseReplay fixture output", () => {
        const replay = parseReplay(readFixture(mainFixture));

        applyPlayerSteamIds(replay, {
            fcmpex: "76561198000000001",
            " Brutal Hummel ": "76561198000000002",
            Unknown: "76561198000000999",
        });

        expect(replay.players).toHaveLength(2);
        expect(replay.players[0].name).toBe("FCMpex");
        expect(replay.players[0].steamId).toBe("76561198000000001");
        expect(replay.players[1].name).toBe("Brutal Hummel");
        expect(replay.players[1].steamId).toBe("76561198000000002");
    });
});
