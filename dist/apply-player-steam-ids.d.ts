import type { ReplayData } from "./replay-types";
/**
 * Applies Steam IDs to replay players by matching player names
 * (trim + case-insensitive). Mutates `replay.players` in place and returns `replay`.
 *
 * Names in the map that do not appear in the replay are ignored.
 * Duplicate player names in the same replay all receive the same Steam ID.
 */
export declare const applyPlayerSteamIds: (replay: ReplayData, steamIdsByName: Record<string, string>) => ReplayData;
