import { isDoctrinal } from "../actions/definitions";
import {
    getDoctrineName,
    type Player,
    type Replay,
} from "../types";
import {
    inferIdFaction,
    isPlayerUnassigned,
} from "./link-ids";

/**
 * An action-stream player ID (`1000`–`1007`) that no header player claimed,
 * with optional faction / doctrine hints inferred from the action stream.
 */
export type UnclaimedPlayerId = {
    /** Unclaimed action player ID. */
    id: number;
    /** Faction inferred from unit production, when known. */
    faction?: string;
    /** First doctrinal object ID seen for this ID, when known. */
    doctrine?: number;
    /** {@link getDoctrineName} of `doctrine`, when known. */
    doctrineName?: string;
};

/**
 * Result of {@link getUnresolvedPlayerIds}: leftover header players and
 * unclaimed engine IDs after automatic linking.
 */
export type UnresolvedPlayerIds = {
    /** Header players with no linked action player ID. */
    unassignedPlayers: Player[];
    /** Action-stream IDs that no header player claimed. */
    unclaimedIds: UnclaimedPlayerId[];
};

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
export const getUnresolvedPlayerIds = (
    replay: Replay,
): UnresolvedPlayerIds => {
    const unassignedPlayers = replay.players.filter(isPlayerUnassigned);
    const assignedIds = new Set(
        replay.players
            .map((p) => p.id)
            .filter((id): id is number => !!id && id !== 0),
    );

    const actionIds = Array.from(
        new Set(replay.actions.map((a) => a.playerId)),
    )
        .filter((id) => id >= 1000 && id <= 1007 && !assignedIds.has(id))
        .sort((a, b) => a - b);

    const doctrineById = new Map<number, number>();
    for (const action of replay.actions) {
        if (!isDoctrinal(action.commandId)) continue;
        if (doctrineById.has(action.playerId)) continue;
        if (getDoctrineName(action.objectId) === undefined) continue;
        doctrineById.set(action.playerId, action.objectId);
    }

    const unclaimedIds: UnclaimedPlayerId[] = actionIds.map((id) => {
        const doctrine = doctrineById.get(id);
        return {
            id,
            faction: inferIdFaction(replay.actions, id),
            doctrine,
            doctrineName:
                doctrine !== undefined ? getDoctrineName(doctrine) : undefined,
        };
    });

    return { unassignedPlayers, unclaimedIds };
};
