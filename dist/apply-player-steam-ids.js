const normalizePlayerName = (name) => name.trim().toLowerCase();
/**
 * Applies Steam IDs to replay players by matching player names
 * (trim + case-insensitive). Mutates `replay.players` in place and returns `replay`.
 *
 * Names in the map that do not appear in the replay are ignored.
 * Duplicate player names in the same replay all receive the same Steam ID.
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
