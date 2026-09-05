import { type Player, type ReplayData } from "./replay-types";
export type UnclaimedPlayerId = {
    id: number;
    /** Faction inferred from unit production in the action stream, when known. */
    faction?: string;
    doctrine?: number;
    doctrineName?: string;
};
export type UnresolvedPlayerIds = {
    /** Header players with no linked action playerID. */
    unassignedPlayers: Player[];
    /** Action-stream IDs that no header player claimed. */
    unclaimedIds: UnclaimedPlayerId[];
};
/**
 * Reports players that still lack an action playerID after parsing, plus the
 * remaining unclaimed IDs (with doctrine when available). Use this to prompt
 * for manual `applyPlayerIds` / `embedPlayerIds` when random-start teammates
 * cannot be linked from chat or a BADCOE blob.
 */
export declare const getUnresolvedPlayerIds: (replay: ReplayData) => UnresolvedPlayerIds;
