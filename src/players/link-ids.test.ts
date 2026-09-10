import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
    applyPlayerIds,
    createEmptyReplay,
    embedPlayerIds,
    getUnresolvedPlayerIds,
    parseReplay,
    type Player,
} from "../index";

const fixturesDir = path.resolve(__dirname, "../../fixtures");
const localProblemReplay = path.resolve(
    __dirname,
    "../../replay_bznk6qkkzf_pcladdt4mp.rec",
);
const chatConfirmedReplay = path.resolve(
    __dirname,
    "../../4p_duclair.2026-02-23.22-27-18.rec",
);
const fixedStartReplay = path.resolve(
    __dirname,
    "../../VIRE RIVER VALLEY (8)  .2026-02-05.00-40-53.rec",
);

const readFixture = (filePath: string) =>
    new Uint8Array(fs.readFileSync(filePath));

const makePlayer = (name: string, overrides: Partial<Player> = {}): Player => ({
    name,
    faction: "allies",
    slot: 0,
    ...overrides,
});

describe("player ID linking", () => {
    it.skipIf(!fs.existsSync(localProblemReplay))(
        "does not guess IDs for same-faction teammates without chat",
        () => {
            const replay = parseReplay(readFixture(localProblemReplay));
            const egy = replay.players.find((p) => p.name === "EGY | GAZA");
            const camo = replay.players.find((p) => p.name === "CamoFILMs");
            const radec = replay.players.find((p) => p.name === "Colonel Radec");
            const ak = replay.players.find((p) => p.name === "AK47ster");

            expect(radec?.id).toBe(1001);
            expect(ak?.id).toBe(1000);
            expect(ak?.doctrineName).toBe("Defensive");
            expect(radec?.doctrineName).toBe("Blitzkrieg");

            expect(egy?.id === undefined || egy?.id === 0).toBe(true);
            expect(camo?.id === undefined || camo?.id === 0).toBe(true);
            expect(egy?.doctrineName).toBeUndefined();
            expect(camo?.doctrineName).toBeUndefined();

            const unresolved = getUnresolvedPlayerIds(replay);
            expect(
                unresolved.unassignedPlayers.map((p) => p.name).sort(),
            ).toEqual(["CamoFILMs", "EGY | GAZA"].sort());
            expect(unresolved.unclaimedIds.map((c) => c.id).sort()).toEqual([
                1002, 1003,
            ]);
            const byId = Object.fromEntries(
                unresolved.unclaimedIds.map((c) => [c.id, c.doctrineName]),
            );
            expect(byId[1002]).toBe("Infantry");
            expect(byId[1003]).toBe("Armor");
        },
    );

    it.skipIf(!fs.existsSync(localProblemReplay))(
        "applyPlayerIds can correct ambiguous teammates and doctrines",
        () => {
            const replay = parseReplay(readFixture(localProblemReplay));
            applyPlayerIds(replay, {
                "EGY | GAZA": 1003,
                CamoFILMs: 1002,
            });

            const egy = replay.players.find((p) => p.name === "EGY | GAZA")!;
            const camo = replay.players.find((p) => p.name === "CamoFILMs")!;

            expect(egy.id).toBe(1003);
            expect(egy.doctrineName).toBe("Armor");
            expect(camo.id).toBe(1002);
            expect(camo.doctrineName).toBe("Infantry");
        },
    );

    it.skipIf(!fs.existsSync(localProblemReplay))(
        "embedPlayerIds persists corrections across parseReplay",
        () => {
            const original = readFixture(localProblemReplay);
            const embedded = embedPlayerIds(original, {
                "EGY | GAZA": 1003,
                CamoFILMs: 1002,
            });
            const replay = parseReplay(embedded);

            expect(replay.players.find((p) => p.name === "EGY | GAZA")?.id).toBe(
                1003,
            );
            expect(replay.players.find((p) => p.name === "CamoFILMs")?.id).toBe(
                1002,
            );
            expect(
                replay.players.find((p) => p.name === "EGY | GAZA")
                    ?.doctrineName,
            ).toBe("Armor");
            expect(
                replay.players.find((p) => p.name === "CamoFILMs")?.doctrineName,
            ).toBe("Infantry");
        },
    );

    it.skipIf(!fs.existsSync(chatConfirmedReplay))(
        "keeps chat-confirmed IDs for same-faction teammates",
        () => {
            const replay = parseReplay(readFixture(chatConfirmedReplay));
            const byName = Object.fromEntries(
                replay.players.map((p) => [p.name, p.id]),
            );

            expect(byName["SHAMAN79"]).toBe(1000);
            expect(byName["pub"]).toBe(1001);
            expect(byName["The best"]).toBe(1002);
            expect(byName["SY"]).toBe(1003);
        },
    );

    it("still links 1v1 players by unique faction", () => {
        const replay = parseReplay(
            readFixture(path.join(fixturesDir, "replay_rj5d3iuirq.rec")),
        );
        expect(replay.players[0]!.name).toBe("FCMpex");
        expect(replay.players[0]!.id).toBe(1000);
        expect(replay.players[1]!.name).toBe("Brutal Hummel");
        expect(replay.players[1]!.id).toBe(1001);
    });

    it.skipIf(!fs.existsSync(fixedStartReplay))(
        "uses 1000+slot on fixed-start games (COHRA model)",
        () => {
            const replay = parseReplay(readFixture(fixedStartReplay));
            expect(replay.header.randomStart).toBe(false);
            for (const p of replay.players) {
                expect(p.id).toBe(1000 + p.slot);
            }
        },
    );
});

describe("applyPlayerIds", () => {
    it("matches case-insensitively and refreshes doctrines", () => {
        const replay = createEmptyReplay();
        replay.players = [
            makePlayer("Alice", { slot: 0, faction: "allies" }),
            makePlayer("Bob", { slot: 1, faction: "allies" }),
        ];
        replay.actions = [
            {
                tick: 1,
                offset: 0,
                playerId: 1003,
                commandId: 0x62,
                objectId: 9,
                packetLength: 18,
                command: {
                    type: "DOCTRINAL",
                    name: "Armor Company",
                    description: "",
                },
            },
            {
                tick: 2,
                offset: 0,
                playerId: 1002,
                commandId: 0x62,
                objectId: 17,
                packetLength: 18,
                command: {
                    type: "DOCTRINAL",
                    name: "Infantry Company",
                    description: "",
                },
            },
        ];

        applyPlayerIds(replay, { alice: 1003, BOB: 1002 });

        expect(replay.players[0]!.id).toBe(1003);
        expect(replay.players[0]!.doctrineName).toBe("Armor");
        expect(replay.players[1]!.id).toBe(1002);
        expect(replay.players[1]!.doctrineName).toBe("Infantry");
    });
});
