import type { Replay } from "../types";
/**
 * Applies in-game action player IDs to replay players by matching names
 * (trim + case-insensitive).
 *
 * Mutates `replay.players` in place, refreshes doctrines from the action stream,
 * and returns the same `replay` reference for chaining.
 *
 * Use when automatic linking cannot disambiguate same-faction teammates on
 * random start — typically after inspecting {@link getUnresolvedPlayerIds}.
 * Persist corrections with {@link embedPlayerIds}.
 *
 * @param replay - Parsed replay to mutate.
 * @param idsByName - Map of lobby name → action player ID (`1000`–`1007`).
 * @returns The same `replay` instance.
 *
 * @example
 * applyPlayerIds(replay, { "EGY | GAZA": 1003, CamoFILMs: 1002 });
 */
export declare const applyPlayerIds: (replay: Replay, idsByName: Record<string, number>) => Replay;
