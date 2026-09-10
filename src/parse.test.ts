import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { formatDuration, parseHeader, parseReplay } from "./index";

const fixturesDir = path.resolve(__dirname, "../fixtures");
const mainFixture = path.join(fixturesDir, "replay_rj5d3iuirq.rec");
const tinyFixture = path.join(fixturesDir, "2p_angoville.rec");
const badc0deMatchTypeFixture = path.join(
    fixturesDir,
    "matchtype_badc0de_header.rec",
);

const readFixture = (filePath: string) =>
    new Uint8Array(fs.readFileSync(filePath));

describe("parseReplay", () => {
    it("parses the main fixture completely", () => {
        const replay = parseReplay(readFixture(mainFixture));

        expect(replay.meta.headerOk).toBe(true);
        expect(replay.meta.dataOk).toBe(true);
        expect(replay.meta.warnings).toEqual([]);
        expect(replay.players.length).toBe(2);
        expect(replay.actions.length).toBeGreaterThan(500);
        expect(replay.durationSeconds).toBeGreaterThan(0);
        expect(formatDuration(replay.durationSeconds)).toMatch(
            /^\d{2}:\d{2}:\d{2}$/,
        );
        expect(replay.header.gameDate).toBe("2026-07-26T19:47:00");
        expect(replay.header.matchType).toBe("automatch");
    });

    it("classifies the majority of move commands", () => {
        const replay = parseReplay(readFixture(mainFixture));
        const moves = replay.actions.filter((a) => a.commandId === 0x2d);
        const classified = moves.filter(
            (a) => a.command?.type === "MOVE_COMMAND",
        );

        expect(moves.length).toBeGreaterThan(0);
        expect(classified.length / moves.length).toBeGreaterThan(0.9);
    });

    it("does not treat entity handles as objectIds", () => {
        const replay = parseReplay(readFixture(mainFixture));
        const suspicious = replay.actions.filter(
            (a) =>
                (a.objectId & 0xffffff) === 0x2000c3 || a.objectId > 0x100000,
        );
        expect(suspicious).toHaveLength(0);
    });

    it("survives truncated input without bounds RangeErrors", () => {
        const full = fs.readFileSync(mainFixture);
        for (let len = 1500; len < full.length; len += 2500) {
            const replay = parseReplay(full.subarray(0, len));
            const boundsErrors = replay.meta.warnings.filter((e) =>
                /outside the bounds|RangeError/i.test(e),
            );
            expect(boundsErrors).toEqual([]);
        }
    });

    it("parses header-only for the tiny fixture", () => {
        const replay = parseHeader(readFixture(tinyFixture));
        expect(replay.meta.warnings).toEqual([]);
        expect(replay).toHaveProperty("meta");
        expect(replay.meta.dataOk).toBe(false);
        expect(replay.header.matchType).toBe("asd");
    });

    it("returns empty matchType for CoH 2.700+ Relic 0xBADC0DE blobs", () => {
        const replay = parseHeader(readFixture(badc0deMatchTypeFixture));
        expect(replay.meta.warnings).toEqual([]);
        expect(replay.meta.headerOk).toBe(true);
        expect(replay.header.matchType).toBe("");
        expect(replay.players.length).toBe(4);
    });
});
