import { normalizePlayerName } from "./link-ids";
/**
 * Applies Steam IDs to replay players by matching player names
 * (trim + case-insensitive).
 *
 * Mutates `replay.players` in place and returns the same `replay` reference.
 * Names in the map that do not appear in the replay are ignored. Duplicate
 * player names in the same replay all receive the same Steam ID.
 *
 * Persist with {@link embedPlayerSteamIds}; {@link parseReplay} /
 * {@link parseHeader} auto-apply trailer maps on load.
 *
 * @param replay - Parsed replay to mutate.
 * @param steamIdsByName - Map of lobby name → Steam ID string.
 * @returns The same `replay` instance.
 *
 * @example
 * applyPlayerSteamIds(replay, {
 *   Alice: "76561198000000001",
 *   Bob: "76561198000000002",
 * });
 */
export const applyPlayerSteamIds = (replay, steamIdsByName) => {
    const lookup = new Map();
    for (const [name, steamId] of Object.entries(steamIdsByName)) {
        lookup.set(normalizePlayerName(name), steamId);
    }
    for (const player of replay.players) {
        const steamId = lookup.get(normalizePlayerName(player.name));
        if (steamId !== undefined) {
            player.steamId = steamId;
        }
    }
    return replay;
};
