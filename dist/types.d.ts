/**
 * Shared public types and small display helpers for parsed CoH1 replays.
 */
/** World-space coordinate triple extracted from a command packet when present. */
export type Vec3 = {
    x: number;
    y: number;
    z: number;
};
/**
 * A player seat from the replay header (`DATAINFO`), optionally linked to an
 * in-game action-stream ID (`1000`–`1007`) and Steam / doctrine metadata.
 */
export type Player = {
    /** Lobby / DATAINFO display name. */
    name: string;
    /**
     * Faction key as stored in the header, e.g. `allies`, `axis`,
     * `allies_commonwealth`, `axis_panzer_elite`.
     */
    faction: string;
    /**
     * In-game action player ID (`1000`–`1007`) when linking succeeded
     * (BADCOE, chat, slot, unique faction, FKSTMETA, or `applyPlayerIds`).
     * Unassigned seats leave this `undefined` (or historically `0`).
     */
    id?: number;
    /** 0-based lobby order index from DATAINFO discovery order. */
    slot: number;
    /** Doctrine object ID from the action stream when known. */
    doctrine?: number;
    /** Human-readable doctrine name from {@link DOCTRINES}. */
    doctrineName?: string;
    /**
     * Opaque DATAINFO field; observed as `0` for the host / recorder seat.
     * Not the action-stream player ID.
     */
    dataInfo1?: number;
    /**
     * Opaque DATAINFO field; observed as team side
     * (`0` allies side, `1` axis side in sampled replays).
     */
    dataInfo2?: number;
    /**
     * Steam ID string when supplied by a BADCOE ladder blob, FKSTMETA trailer,
     * or {@link applyPlayerSteamIds}.
     */
    steamId?: string;
};
/**
 * Per-player ladder fields from a Replay Manager `0xBADC0DE` matchname blob.
 * Action player ID = `1000 + mpn`.
 */
export type RelicLadderPlayer = {
    /** Decimal Steam ID as a string (may be `"0"` for empty slots). */
    steamId: string;
    /** Map position number (`0`–`7`); engine ID is `1000 + mpn`. */
    mpn: number;
    rankingBefore: number;
    rankingAfter: number;
    level: number;
    result: number;
};
/**
 * A chat line from the post-header message stream (marker `1`).
 * Timestamps are not stored; use {@link formatTickTimestamp} with `tick`.
 */
export type ChatMessage = {
    /** Engine tick at 8 Hz when the message was recorded. */
    tick: number;
    /** Sender name, or `"System"` for system messages. */
    sender: string;
    /** Sender action player ID; `0` for system. */
    playerId: number;
    /** UTF-16 message body. */
    content: string;
    /** Recipient / channel code from the packet. */
    recipient: number;
};
/**
 * Human-oriented command label attached when `enrichCommands` is enabled.
 * `type` is a stable category string (`MOVE_COMMAND`, `UNIT`, `AI_TAKEOVER`, …).
 */
export type Command = {
    type: string;
    name: string;
    description: string;
};
/**
 * One decoded command packet from the tick stream.
 *
 * Lean by design: no per-action `playerName` / `timestamp` strings. Resolve
 * those with {@link playerNameById} and {@link formatTickTimestamp}.
 */
export type Action = {
    /** Engine tick (8 Hz) owning this packet. */
    tick: number;
    /** Issuing player (`1000`–`1007` for humans). */
    playerId: number;
    /** Primary command opcode from the packet. */
    commandId: number;
    /** Subtype / object ID (unit, ability, doctrinal pick, …). */
    objectId: number;
    /** Absolute byte offset of the packet in the stripped CoH body. */
    offset: number;
    /** Raw packet length in bytes. */
    packetLength: number;
    /** World position when the command family carries coordinates. */
    position?: Vec3;
    /**
     * Command label from definition tables. Present only when
     * `ParseOptions.enrichCommands` is enabled (default for {@link parseReplay}).
     */
    command?: Command;
};
/**
 * Fixed header fields from the preamble + Relic Chunky `DATASDSC` / `DATABASE`
 * chunks (not including the tick stream).
 */
export type ReplayHeader = {
    /** Replay format version (`u32` at file start). */
    version: number;
    /** 8-byte ASCII game type string. */
    gameType: string;
    /**
     * Local wall-clock datetime `YYYY-MM-DDTHH:mm:ss` with no timezone suffix.
     * Parsed from the recorder's Windows culture date string.
     */
    gameDate: string;
    /** Mod name / folder from DATASDSC. */
    modName: string;
    /** Localized / display map name. */
    mapName: string;
    /** Internal map file identity string. */
    mapFileName: string;
    /** Map description text from DATASDSC. */
    mapDescription: string;
    mapWidth: number;
    mapHeight: number;
    /**
     * Lobby match name (`"automatch"`, custom strings, …).
     * Empty string when a `0xBADC0DE` binary blob replaced the ASCII name.
     */
    matchType: string;
    highResources: boolean;
    /** When true, lobby slot ≠ engine ID unless otherwise evidenced. */
    randomStart: boolean;
    /** Victory-point total derived from the encoded VP index. */
    vpCount: number;
    /** Whether this is a VP game (magic flag in DATABASE). */
    vpGame: boolean;
    /** Official replay title shown in CoH / Replay Manager. */
    replayName: string;
};
/** Parse status flags and soft-fail messages. */
export type ReplayMeta = {
    /** True after the fixed header + Relic Chunky regions parsed successfully. */
    headerOk: boolean;
    /** True after the tick/chat demux finished (full parse only). */
    dataOk: boolean;
    /**
     * Soft-fail diagnostics. High-level parsers never throw to callers;
     * recoverable / fatal parse issues are recorded here instead.
     */
    warnings: string[];
};
/**
 * Complete parse result for a CoH1 `.rec` (header always; chat/actions when
 * the tick stream was parsed).
 */
export type Replay = {
    header: ReplayHeader;
    players: Player[];
    chat: ChatMessage[];
    actions: Action[];
    /**
     * Replay Manager ladder rows when a `0xBADC0DE` blob was present.
     * Index aligns with lobby / `players` order when counts match.
     */
    ladder?: RelicLadderPlayer[];
    /** Match length in seconds (engine ticks ÷ 8). */
    durationSeconds: number;
    meta: ReplayMeta;
};
/**
 * Options for {@link parseReplay}.
 *
 * Defaults (when omitted): `actions: true`, `enrichCommands: true`.
 */
export type ParseOptions = {
    /**
     * When `false`, skip tick/chat demux (header + DATAINFO players only).
     * BADCOE ladder IDs / Steam may still apply. Default `true`.
     */
    actions?: boolean;
    /**
     * When `false`, omit `action.command` labels (cheaper; raw IDs + positions
     * still decoded). Default `true`.
     */
    enrichCommands?: boolean;
};
/**
 * Known doctrinal company object IDs → display names.
 * Used when attaching `player.doctrineName` from doctrinal actions.
 */
export declare const DOCTRINES: Record<number, string>;
/**
 * Looks up a doctrine display name by object ID.
 *
 * @param doctrineId - Doctrinal action `objectId` (e.g. `9` for Armor).
 * @returns The doctrine name, or `undefined` if unknown.
 */
export declare const getDoctrineName: (doctrineId: number) => string | undefined;
/**
 * Creates a zeroed {@link ReplayHeader} suitable for incremental fills or tests.
 *
 * @returns A new header object with empty strings and numeric defaults.
 */
export declare const createEmptyHeader: () => ReplayHeader;
/**
 * Creates an empty {@link Replay} shell (`meta.headerOk` / `dataOk` false).
 *
 * Used by the parsers as the mutable accumulate target and by unit tests that
 * build synthetic replays by hand.
 *
 * @returns A new empty replay object.
 */
export declare const createEmptyReplay: () => Replay;
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
export declare const formatTickTimestamp: (tick: number) => string;
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
export declare const formatDuration: (totalSeconds: number) => string;
/**
 * Finds the lobby player name for a given action-stream player ID.
 *
 * @param players - Players from a parsed {@link Replay}.
 * @param playerId - Action player ID (`1000`–`1007`).
 * @returns The matching player's `name`, or `undefined` if none linked.
 */
export declare const playerNameById: (players: readonly Player[], playerId: number) => string | undefined;
