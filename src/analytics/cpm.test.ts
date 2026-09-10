import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
    actionsUntilAiTakeover,
    countCpmCommands,
    cpmEligibleActions,
    parseReplay,
    playerCpm,
    playerCpmLabel,
} from "../index";

const root = path.resolve(__dirname, "../..");
const fixturesDir = path.join(root, "fixtures");

const read = (filePath: string) => new Uint8Array(fs.readFileSync(filePath));

const optionalRec = (name: string): string | null => {
    const p = path.join(root, name);
    return fs.existsSync(p) ? p : null;
};

describe("playerCpm", () => {
    it("returns 0 for missing player / empty duration", () => {
        const replay = parseReplay(
            read(path.join(fixturesDir, "replay_rj5d3iuirq.rec")),
        );
        expect(playerCpm(replay, null)).toBe(0);
        expect(playerCpm(replay, undefined)).toBe(0);
        expect(
            playerCpm(
                { ...replay, durationSeconds: 0 },
                replay.players[0]?.id,
            ),
        ).toBe(0);
        expect(playerCpmLabel(replay, null)).toBe("0");
    });

    it("is far below raw action rate on the main fixture", () => {
        const replay = parseReplay(
            read(path.join(fixturesDir, "replay_rj5d3iuirq.rec")),
        );
        const mins = replay.durationSeconds / 60;
        for (const p of replay.players) {
            if (p.id == null) continue;
            const raw = replay.actions.filter((a) => a.playerId === p.id)
                .length;
            const rawCpm = raw / mins;
            const cpm = playerCpm(replay, p.id);
            expect(cpm).toBeGreaterThan(0);
            expect(cpm).toBeLessThanOrEqual(Math.round(rawCpm));
            expect(countCpmCommands(replay.actions, p.id)).toBeLessThanOrEqual(
                raw,
            );
        }
    });

    it("stops counting at AI takeover and ignores takeover itself", () => {
        const file = optionalRec(
            "4p_rails and metal.2026-06-28.02-38-26.rec",
        );
        if (!file) return;

        const replay = parseReplay(read(file));
        const dropped = replay.players.find((p) => p.name.includes("[=]"));
        expect(dropped?.id).toBeTypeOf("number");

        const until = actionsUntilAiTakeover(replay.actions, dropped!.id!);
        expect(until.some((a) => a.command?.type === "AI_TAKEOVER")).toBe(true);
        expect(
            cpmEligibleActions(replay.actions, dropped!.id!).some(
                (a) => a.command?.type === "AI_TAKEOVER",
            ),
        ).toBe(false);

        expect(playerCpm(replay, dropped!.id)).toBe(0);
    });

    it("matches Replay Manager / C2A reference values when sample replays exist", () => {
        const cases: Array<{
            file: string;
            expected: Record<string, number>;
        }> = [
            {
                file: "4p_rails and metal.2026-06-28.02-38-26.rec",
                expected: {
                    "Number six": 29,
                    AltesEisen81: 44,
                    "-[=]-[=]-": 0,
                    "STATE GRID": 112,
                },
            },
            {
                file: "4p_duclair.2026-02-23.17-55-31.rec",
                expected: {
                    Spartacus: 53,
                    "The best": 99,
                },
            },
        ];

        let ran = 0;
        for (const { file, expected } of cases) {
            const full = optionalRec(file);
            if (!full) continue;
            ran++;
            const replay = parseReplay(read(full));
            for (const [name, cpm] of Object.entries(expected)) {
                const player = replay.players.find((p) => p.name === name);
                expect(player?.id, name).toBeTypeOf("number");
                expect(
                    Math.abs(playerCpm(replay, player!.id) - cpm),
                ).toBeLessThanOrEqual(1);
            }
        }
        if (ran === 0) {
            expect(ran).toBe(0);
        }
    });
});
