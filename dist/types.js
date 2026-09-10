/**
 * Shared public types and small display helpers for parsed CoH1 replays.
 */
/**
 * Known doctrinal company object IDs → display names.
 * Used when attaching `player.doctrineName` from doctrinal actions.
 */
export const DOCTRINES = {
    2: "Airborne",
    9: "Armor",
    17: "Infantry",
    186: "Blitzkrieg",
    194: "Defensive",
    265: "Terror",
    295: "Luftwaffe",
    302: "Scorched Earth",
    309: "Tank Destroyer",
    316: "Royal Artillery",
    323: "Royal Commandos",
    330: "Royal Engineers",
};
/**
 * Looks up a doctrine display name by object ID.
 *
 * @param doctrineId - Doctrinal action `objectId` (e.g. `9` for Armor).
 * @returns The doctrine name, or `undefined` if unknown.
 */
export const getDoctrineName = (doctrineId) => DOCTRINES[doctrineId];
/**
 * Creates a zeroed {@link ReplayHeader} suitable for incremental fills or tests.
 *
 * @returns A new header object with empty strings and numeric defaults.
 */
export const createEmptyHeader = () => ({
    version: 0,
    gameType: "",
    gameDate: "",
    modName: "",
    mapName: "",
    mapFileName: "",
    mapDescription: "",
    mapWidth: 0,
    mapHeight: 0,
    matchType: "",
    highResources: false,
    randomStart: false,
    vpCount: 0,
    vpGame: false,
    replayName: "",
});
/**
 * Creates an empty {@link Replay} shell (`meta.headerOk` / `dataOk` false).
 *
 * Used by the parsers as the mutable accumulate target and by unit tests that
 * build synthetic replays by hand.
 *
 * @returns A new empty replay object.
 */
export const createEmptyReplay = () => ({
    header: createEmptyHeader(),
    players: [],
    chat: [],
    actions: [],
    durationSeconds: 0,
    meta: { headerOk: false, dataOk: false, warnings: [] },
});
/**
 * Formats an engine tick as `HH:MM:SS` wall time inside the match
 * (tick ÷ 8 = seconds).
 *
 * @param tick - Engine tick index at 8 Hz.
 * @returns Zero-padded `HH:MM:SS` string.
 *
 * @example
 * formatTickTimestamp(480); // "00:01:00"
 */
export const formatTickTimestamp = (tick) => {
    const totalSeconds = Math.floor(tick / 8);
    return formatDuration(totalSeconds);
};
/**
 * Formats a duration in seconds as zero-padded `HH:MM:SS`.
 * Negative inputs are clamped to `0`.
 *
 * @param totalSeconds - Duration in seconds (fractional part truncated).
 * @returns Zero-padded `HH:MM:SS` string.
 *
 * @example
 * formatDuration(3661); // "01:01:01"
 */
export const formatDuration = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};
/**
 * Finds the lobby player name for a given action-stream player ID.
 *
 * @param players - Players from a parsed {@link Replay}.
 * @param playerId - Action player ID (`1000`–`1007`).
 * @returns The matching player's `name`, or `undefined` if none linked.
 */
export const playerNameById = (players, playerId) => players.find((p) => p.id !== undefined && p.id !== 0 && p.id === playerId)
    ?.name;
