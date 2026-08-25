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
/** Strips any existing FKSTMETA trailer; returns the official replay body. */
export declare const stripReplayMetadata: (input: ArrayBuffer | Uint8Array) => Uint8Array;
/**
 * Appends (or replaces) a FKSTMETA trailer with the given steam ID map.
 * Returns a new Uint8Array suitable for saving as a `.rec` file.
 */
export declare const embedPlayerSteamIds: (input: ArrayBuffer | Uint8Array, steamIdsByName: Record<string, string>) => Uint8Array;
