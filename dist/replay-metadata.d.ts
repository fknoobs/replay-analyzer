/**
 * Optional metadata trailer appended after the official CoH1 replay bytes.
 *
 * Layout (end of file):
 *   [original replay body]
 *   [JSON UTF-8 payload]
 *   [u32 LE jsonByteLength]
 *   [u32 LE version]
 *   [8 ASCII magic "FKSTMETA"]
 *
 * The game tick stream never sees this trailer because we strip it before parsing.
 */
export type ReplayMetadata = {
    steamIdsByName: Record<string, string>;
    /** Saved name → action playerID corrections (e.g. ambiguous teammates). */
    playerIdsByName: Record<string, number>;
};
export type ExtractedReplay = {
    /** Bytes the official parser should read (trailer stripped). */
    body: Uint8Array;
    metadata: ReplayMetadata | null;
};
/**
 * If a FKSTMETA trailer is present, returns the official body and parsed metadata.
 * Otherwise returns the full buffer as body with null metadata.
 */
export declare const extractReplayMetadata: (input: ArrayBuffer | Uint8Array) => ExtractedReplay;
/** Strips any existing FKSTMETA trailer; returns the official replay body (may be a view). */
export declare const stripReplayMetadata: (input: ArrayBuffer | Uint8Array) => Uint8Array;
/** True when the buffer ends with a valid FKSTMETA trailer. */
export declare const hasReplayMetadata: (input: ArrayBuffer | Uint8Array) => boolean;
/**
 * Removes custom FKSTMETA metadata and returns a detached copy of the original
 * CoH1 replay bytes (suitable for saving as a `.rec`).
 *
 * Does not undo official header edits such as `setReplayName`.
 */
export declare const resetReplayMetadata: (input: ArrayBuffer | Uint8Array) => Uint8Array;
/**
 * Appends (or replaces) a FKSTMETA trailer with the given metadata.
 * Returns a new Uint8Array suitable for saving as a `.rec` file.
 */
export declare const embedReplayMetadata: (input: ArrayBuffer | Uint8Array, metadata: ReplayMetadata) => Uint8Array;
/**
 * Appends (or replaces) steam IDs in the FKSTMETA trailer.
 * Preserves any existing `playerIdsByName` entries.
 */
export declare const embedPlayerSteamIds: (input: ArrayBuffer | Uint8Array, steamIdsByName: Record<string, string>) => Uint8Array;
/**
 * Appends (or replaces) action playerID overrides in the FKSTMETA trailer.
 * Preserves any existing `steamIdsByName` entries.
 */
export declare const embedPlayerIds: (input: ArrayBuffer | Uint8Array, playerIdsByName: Record<string, number>) => Uint8Array;
