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
 *
 * When the footer magic + lengths are valid but JSON is corrupt, still strips the
 * trailer so callers can recover a CoH-readable body.
 */
export declare const extractReplayMetadata: (input: ArrayBuffer | Uint8Array) => ExtractedReplay;
/** True when the buffer ends with a FKSTMETA magic footer (even if JSON is corrupt). */
export declare const hasReplayMetadataTrailer: (input: ArrayBuffer | Uint8Array) => boolean;
/** True when the buffer ends with a valid FKSTMETA trailer with parseable metadata. */
export declare const hasReplayMetadata: (input: ArrayBuffer | Uint8Array) => boolean;
/** Strips any existing FKSTMETA trailer; returns the official replay body (may be a view). */
export declare const stripReplayMetadata: (input: ArrayBuffer | Uint8Array) => Uint8Array;
/**
 * Removes custom FKSTMETA metadata and returns a detached copy of the official
 * CoH1 replay body (suitable for saving as a `.rec` for the game / Replay Manager).
 *
 * Note: this does not undo prior `setReplayName` edits on the body. Callers that
 * need a full restore should keep the pristine upload bytes separately.
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
