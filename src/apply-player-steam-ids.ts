import type { ReplayData } from "./replay-types";

const normalizePlayerName = (name: string): string => name.trim().toLowerCase();

/**
 * Applies Steam IDs to replay players by matching player names
 * (trim + case-insensitive). Mutates `replay.players` in place and returns `replay`.
 *
 * Names in the map that do not appear in the replay are ignored.
 * Duplicate player names in the same replay all receive the same Steam ID.
 */
export const applyPlayerSteamIds = (
    replay: ReplayData,
    steamIdsByName: Record<string, string>,
): ReplayData => {
    const lookup = new Map<string, string>();
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
