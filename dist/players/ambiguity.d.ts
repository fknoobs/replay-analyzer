import { type Player, type Replay } from "../types";
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
export declare const getUnresolvedPlayerIds: (replay: Replay) => UnresolvedPlayerIds;
