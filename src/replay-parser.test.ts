import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseReplay, parseHeader } from "../src/replay-parser";

const fixturesDir = path.resolve(__dirname, "../fixtures");
const mainFixture = path.join(fixturesDir, "replay_rj5d3iuirq.rec");
const tinyFixture = path.join(fixturesDir, "2p_angoville.rec");
const badc0deMatchTypeFixture = path.join(
    fixturesDir,
    "matchtype_badc0de_header.rec",
);

const readFixture = (filePath: string) => new Uint8Array(fs.readFileSync(filePath));

describe("parseReplay", () => {
    it("parses the main fixture completely", () => {
        const replay = parseReplay(readFixture(mainFixture));

        expect(replay.headerParsed).toBe(true);
        expect(replay.dataParsed).toBe(true);
        expect(replay.errors).toEqual([]);
        expect(replay.players.length).toBe(2);
        expect(replay.actions.length).toBeGreaterThan(500);
        expect(replay.duration).toBeGreaterThan(0);
        expect(replay.durationReadable).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        // Raw header date is "26/07/2026 19:47" (DMY) — wall-clock, no UTC Z
        expect(replay.gameDate).toBe("2026-07-26T19:47:00");
        expect(replay.matchType).toBe("automatch");
    });

    it("classifies the majority of move commands", () => {
        const replay = parseReplay(readFixture(mainFixture));
        const moves = replay.actions.filter((a) => a.commandID === 0x2d);
        const classified = moves.filter((a) => a.command?.type === "MOVE_COMMAND");

        expect(moves.length).toBeGreaterThan(0);
        expect(classified.length / moves.length).toBeGreaterThan(0.9);
    });

    it("does not treat entity handles as objectIDs", () => {
        const replay = parseReplay(readFixture(mainFixture));
        const suspicious = replay.actions.filter(
            (a) => (a.objectID & 0xffffff) === 0x2000c3 || a.objectID > 0x100000,
        );
        expect(suspicious).toHaveLength(0);
    });

    it("survives truncated input without bounds RangeErrors", () => {
        const full = fs.readFileSync(mainFixture);
        for (let len = 1500; len < full.length; len += 2500) {
            const replay = parseReplay(full.subarray(0, len));
            const boundsErrors = replay.errors.filter((e) =>
                /outside the bounds|RangeError/i.test(e),
            );
            expect(boundsErrors).toEqual([]);
        }
    });

    it("parses header-only for the tiny fixture", () => {
        const replay = parseHeader(readFixture(tinyFixture));
        expect(replay.errors).toEqual([]);
        // Tiny / incomplete files may or may not fully parse header;
        // ensure we never throw and return a ReplayData shape.
        expect(replay).toHaveProperty("headerParsed");
        expect(replay).toHaveProperty("dataParsed", false);
        expect(replay.matchType).toBe("asd");
    });

    it("returns empty matchType for CoH 2.700+ Relic 0xBADC0DE blobs", () => {
        const replay = parseHeader(readFixture(badc0deMatchTypeFixture));
        expect(replay.errors).toEqual([]);
        expect(replay.headerParsed).toBe(true);
        expect(replay.matchType).toBe("");
        expect(replay.players.length).toBe(4);
    });
});
