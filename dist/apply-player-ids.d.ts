import { type ReplayData } from "./replay-types";
/**
 * Applies in-game action playerIDs to replay players by matching names
 * (trim + case-insensitive). Mutates `replay.players` / action names / doctrines
 * in place and returns `replay`.
 *
 * Use when chat/faction inference cannot disambiguate same-faction teammates.
 */
export declare const applyPlayerIds: (replay: ReplayData, idsByName: Record<string, number>) => ReplayData;
