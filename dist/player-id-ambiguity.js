import { isDoctrinal, isUnit } from "./action-definitions";
import { getDoctrineName, } from "./replay-types";
const isPlayerUnassigned = (player) => player.id === undefined || player.id === 0;
const inferIdFaction = (replay, id) => {
    const US = new Set([0x30, 0xa, 0x3d, 0x4b, 0x4f, 0x3f, 0x41]);
    const CW = new Set([0x7b, 0x72, 0x85, 0x79, 0x8e, 0x9a, 0x5c]);
    const WEHR = new Set([0xbc, 0xcf, 0xa4, 0xed, 0xe6, 0xbd, 0xf3, 0xf2]);
    const PE = new Set([0x121, 0x141, 0x127, 0x139, 0x13c, 0x131, 0x12a, 0x12b]);
    for (const action of replay.actions) {
        if (action.playerID !== id || !isUnit(action.commandID))
            continue;
        if (US.has(action.objectID))
            return "allies";
        if (CW.has(action.objectID))
            return "allies_commonwealth";
        if (WEHR.has(action.objectID))
            return "axis";
        if (PE.has(action.objectID))
            return "axis_panzer_elite";
    }
    return undefined;
};
/**
 * Reports players that still lack an action playerID after parsing, plus the
 * remaining unclaimed IDs (with doctrine when available). Use this to prompt
 * for manual `applyPlayerIds` / `embedPlayerIds` when random-start teammates
 * cannot be linked from chat or a BADCOE blob.
 */
export const getUnresolvedPlayerIds = (replay) => {
    const unassignedPlayers = replay.players.filter(isPlayerUnassigned);
    const assignedIds = new Set(replay.players
        .map((p) => p.id)
        .filter((id) => !!id && id !== 0));
    const actionIds = Array.from(new Set(replay.actions.map((a) => a.playerID)))
        .filter((id) => id >= 1000 && id <= 1007 && !assignedIds.has(id))
        .sort((a, b) => a - b);
    const unclaimedIds = actionIds.map((id) => {
        const doctrineAction = replay.actions.find((action) => isDoctrinal(action.commandID) &&
            action.playerID === id &&
            getDoctrineName(action.objectID) !== undefined);
        const doctrine = doctrineAction?.objectID;
        return {
            id,
            faction: inferIdFaction(replay, id),
            doctrine,
            doctrineName: doctrine !== undefined ? getDoctrineName(doctrine) : undefined,
        };
    });
    return { unassignedPlayers, unclaimedIds };
};
