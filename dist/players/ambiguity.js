import { isDoctrinal } from "../actions/definitions";
import { getDoctrineName, } from "../types";
import { inferIdFaction, isPlayerUnassigned, } from "./link-ids";
/**
 * Reports players that still lack an action player ID after parsing, plus the
 * remaining unclaimed IDs (with doctrine / faction hints when available).
 *
 * Use this to prompt for manual {@link applyPlayerIds} / {@link embedPlayerIds}
 * when random-start teammates cannot be linked from chat or a BADCOE blob.
 *
 * @param replay - Fully parsed replay (`actions` required for useful hints).
 * @returns Unassigned header players and unclaimed engine IDs.
 *
 * @example
 * const { unassignedPlayers, unclaimedIds } = getUnresolvedPlayerIds(replay);
 * if (unassignedPlayers.length) {
 *   // show UI to map names → unclaimedIds[].id
 * }
 */
export const getUnresolvedPlayerIds = (replay) => {
    const unassignedPlayers = replay.players.filter(isPlayerUnassigned);
    const assignedIds = new Set(replay.players
        .map((p) => p.id)
        .filter((id) => !!id && id !== 0));
    const actionIds = Array.from(new Set(replay.actions.map((a) => a.playerId)))
        .filter((id) => id >= 1000 && id <= 1007 && !assignedIds.has(id))
        .sort((a, b) => a - b);
    const doctrineById = new Map();
    for (const action of replay.actions) {
        if (!isDoctrinal(action.commandId))
            continue;
        if (doctrineById.has(action.playerId))
            continue;
        if (getDoctrineName(action.objectId) === undefined)
            continue;
        doctrineById.set(action.playerId, action.objectId);
    }
    const unclaimedIds = actionIds.map((id) => {
        const doctrine = doctrineById.get(id);
        return {
            id,
            faction: inferIdFaction(replay.actions, id),
            doctrine,
            doctrineName: doctrine !== undefined ? getDoctrineName(doctrine) : undefined,
        };
    });
    return { unassignedPlayers, unclaimedIds };
};
