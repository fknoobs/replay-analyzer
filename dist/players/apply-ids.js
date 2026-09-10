import { attachPlayerDoctrines, normalizePlayerName } from "./link-ids";
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
export const applyPlayerIds = (replay, idsByName) => {
    const lookup = new Map();
    for (const [name, id] of Object.entries(idsByName)) {
        if (typeof id === "number" && id !== 0) {
            lookup.set(normalizePlayerName(name), id);
        }
    }
    for (const player of replay.players) {
        const id = lookup.get(normalizePlayerName(player.name));
        if (id !== undefined) {
            player.id = id;
        }
    }
    attachPlayerDoctrines(replay.players, replay.actions);
    return replay;
};
