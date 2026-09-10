import { isDoctrinal, isUnit } from "../actions/definitions";
import { getDoctrineName, } from "../types";
/**
 * Normalizes a player name for case-insensitive matching (trim + lower-case).
 * @param name - Raw lobby or chat name.
 * @returns Normalized lookup key.
 */
export const normalizePlayerName = (name) => name.trim().toLowerCase();
/**
 * Returns whether a player still lacks a usable action-stream ID.
 * Treats both `undefined` and `0` as unassigned (legacy / DATAINFO default).
 *
 * @param player - Player (or id-bearing subset) to test.
 */
export const isPlayerUnassigned = (player) => player.id === undefined || player.id === 0;
const US_UNITS = new Set([0x30, 0xa, 0x3d, 0x4b, 0x4f, 0x3f, 0x41]);
const CW_UNITS = new Set([0x7b, 0x72, 0x85, 0x79, 0x8e, 0x9a, 0x5c]);
const WEHR_UNITS = new Set([0xbc, 0xcf, 0xa4, 0xed, 0xe6, 0xbd, 0xf3, 0xf2]);
const PE_UNITS = new Set([
    0x121, 0x141, 0x127, 0x139, 0x13c, 0x131, 0x12a, 0x12b,
]);
/**
 * Builds a map of action player ID → faction key by scanning unit-production
 * commands for faction-characteristic object IDs.
 *
 * @param actions - Decoded action stream.
 * @returns Map of playerId → faction string (`allies`, `axis`, …).
 */
export const buildIdFactionMap = (actions) => {
    const idFactionMap = new Map();
    for (const action of actions) {
        if (!isUnit(action.commandId))
            continue;
        if (US_UNITS.has(action.objectId)) {
            idFactionMap.set(action.playerId, "allies");
        }
        else if (CW_UNITS.has(action.objectId)) {
            idFactionMap.set(action.playerId, "allies_commonwealth");
        }
        else if (WEHR_UNITS.has(action.objectId)) {
            idFactionMap.set(action.playerId, "axis");
        }
        else if (PE_UNITS.has(action.objectId)) {
            idFactionMap.set(action.playerId, "axis_panzer_elite");
        }
    }
    return idFactionMap;
};
/**
 * Infers a single action player ID's faction from the first matching unit
 * production command in the stream.
 *
 * @param actions - Decoded action stream.
 * @param id - Action player ID to inspect.
 * @returns Faction key, or `undefined` when no characteristic unit was found.
 */
export const inferIdFaction = (actions, id) => {
    for (const action of actions) {
        if (action.playerId !== id || !isUnit(action.commandId))
            continue;
        if (US_UNITS.has(action.objectId))
            return "allies";
        if (CW_UNITS.has(action.objectId))
            return "allies_commonwealth";
        if (WEHR_UNITS.has(action.objectId))
            return "axis";
        if (PE_UNITS.has(action.objectId))
            return "axis_panzer_elite";
    }
    return undefined;
};
/**
 * Applies Replay Manager `0xBADC0DE` Steam IDs + MPN→playerId links when the
 * blob player count matches the header lobby order.
 *
 * For each lobby index `i`: sets `steamId` when missing, and assigns
 * `id = 1000 + mpn` to still-unassigned players (skipping claimed IDs / bad MPN).
 *
 * @param players - Header players to mutate (lobby order).
 * @param ladder - Ladder rows aligned with `players`, or `undefined`.
 */
export const applyRelicLadderPlayers = (players, ladder) => {
    if (!ladder || ladder.length === 0)
        return;
    if (ladder.length !== players.length)
        return;
    const claimedIds = new Set(players
        .map((p) => p.id)
        .filter((id) => !!id && id !== 0));
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const entry = ladder[i];
        if ((player.steamId === undefined || player.steamId.length === 0) &&
            entry.steamId !== "0") {
            player.steamId = entry.steamId;
        }
        if (!isPlayerUnassigned(player))
            continue;
        if (entry.mpn > 7)
            continue;
        const id = 1000 + entry.mpn;
        if (claimedIds.has(id))
            continue;
        player.id = id;
        claimedIds.add(id);
    }
};
/**
 * Attaches `doctrine` / `doctrineName` on each linked player from the first
 * recognizable doctrinal action for that player ID. Clears doctrine fields on
 * unassigned players.
 *
 * @param players - Players to mutate.
 * @param actions - Action stream to scan (single pass).
 */
/**
 * Attaches `doctrine` / `doctrineName` on each linked player from the first
 * recognizable doctrinal action for that player ID. Clears doctrine fields on
 * unassigned players.
 *
 * @param players - Players to mutate.
 * @param actions - Action stream to scan (single pass).
 */
export const attachPlayerDoctrines = (players, actions) => {
    const doctrineByPlayer = new Map();
    for (const action of actions) {
        if (!isDoctrinal(action.commandId))
            continue;
        if (doctrineByPlayer.has(action.playerId))
            continue;
        if (getDoctrineName(action.objectId) === undefined)
            continue;
        doctrineByPlayer.set(action.playerId, action.objectId);
    }
    for (const player of players) {
        if (player.id === undefined || player.id === 0) {
            player.doctrine = undefined;
            player.doctrineName = undefined;
            continue;
        }
        const doctrine = doctrineByPlayer.get(player.id);
        player.doctrine = doctrine;
        player.doctrineName =
            doctrine !== undefined ? getDoctrineName(doctrine) : undefined;
    }
};
/**
 * Links header players to in-game action player IDs (`1000`–`1007`).
 *
 * Order of evidence:
 * 1. BADCOE ladder blob (MPN + Steam)
 * 2. Chat sender name ↔ playerId
 * 3. Fixed-start slot scheme (`1000 + slot`), or random-start when factions align
 * 4. Unique faction / side residuals
 *
 * Never assigns multiple same-faction teammates by sorted-ID ↔ lobby order —
 * that historically swapped Armor/Infantry on random-start 2v2 replays.
 * Ambiguous seats stay without `id`; use {@link getUnresolvedPlayerIds}.
 *
 * Also attaches doctrines via {@link attachPlayerDoctrines}.
 *
 * @param replay - Parsed replay with `players`, `chat`, `actions`, and optional `ladder`.
 */
export const linkPlayerIds = (replay) => {
    applyRelicLadderPlayers(replay.players, replay.ladder);
    const claimedIds = new Set(replay.players
        .map((p) => p.id)
        .filter((id) => !!id && id !== 0));
    for (const message of replay.chat) {
        if (!message.sender || message.sender === "System")
            continue;
        if (!message.playerId || claimedIds.has(message.playerId))
            continue;
        const senderKey = normalizePlayerName(message.sender);
        const player = replay.players.find((p) => isPlayerUnassigned(p) &&
            normalizePlayerName(p.name) === senderKey);
        if (!player)
            continue;
        player.id = message.playerId;
        claimedIds.add(message.playerId);
    }
    const idFactionMap = buildIdFactionMap(replay.actions);
    const actionPlayerIds = Array.from(new Set(replay.actions.map((a) => a.playerId))).sort((a, b) => a - b);
    const assignedIds = new Set(replay.players
        .map((p) => p.id)
        .filter((id) => !!id && id !== 0));
    const factionsMatch = (playerFaction, id) => {
        const inferred = idFactionMap.get(id);
        if (!inferred)
            return true;
        return inferred === playerFaction;
    };
    const tryAssignSlotIds = (requireFactionEvidence) => {
        const candidates = replay.players
            .filter(isPlayerUnassigned)
            .map((p) => ({ player: p, id: 1000 + p.slot }));
        if (candidates.length === 0)
            return;
        const available = new Set(actionPlayerIds.filter((id) => !assignedIds.has(id)));
        for (const { player, id } of candidates) {
            if (!available.has(id))
                return;
            if (requireFactionEvidence) {
                const inferred = idFactionMap.get(id);
                if (!inferred || inferred !== player.faction)
                    return;
            }
            else if (!factionsMatch(player.faction, id)) {
                return;
            }
        }
        for (const { player, id } of candidates) {
            player.id = id;
            assignedIds.add(id);
        }
    };
    if (!replay.header.randomStart) {
        tryAssignSlotIds(false);
    }
    else {
        tryAssignSlotIds(true);
    }
    const assignUnique = (players, ids) => {
        if (players.length !== 1 || ids.length !== 1)
            return;
        const player = players[0];
        const id = ids[0];
        if (!isPlayerUnassigned(player) || assignedIds.has(id))
            return;
        player.id = id;
        assignedIds.add(id);
    };
    const factions = [
        "allies",
        "allies_commonwealth",
        "axis",
        "axis_panzer_elite",
    ];
    for (const faction of factions) {
        const playersOfFaction = replay.players.filter((p) => isPlayerUnassigned(p) && p.faction === faction);
        const idsOfFaction = actionPlayerIds.filter((id) => !assignedIds.has(id) && idFactionMap.get(id) === faction);
        assignUnique(playersOfFaction, idsOfFaction);
    }
    {
        const unassigned = replay.players.filter(isPlayerUnassigned);
        const remainingIds = actionPlayerIds.filter((id) => !assignedIds.has(id));
        assignUnique(unassigned.filter((p) => p.faction.includes("allies")), remainingIds.filter((id) => {
            const f = idFactionMap.get(id);
            return !!f && f.includes("allies");
        }));
        assignUnique(unassigned.filter((p) => p.faction.includes("axis")), remainingIds.filter((id) => {
            const f = idFactionMap.get(id);
            return !!f && f.includes("axis");
        }));
    }
    attachPlayerDoctrines(replay.players, replay.actions);
};
