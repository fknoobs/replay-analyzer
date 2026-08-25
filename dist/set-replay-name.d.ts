/**
 * Rewrites the CoH1 header `replayName` (length-prefixed UTF-16LE in DATABASE).
 * Preserves any existing FKSTMETA trailer. Returns a new Uint8Array.
 */
export declare const setReplayName: (input: ArrayBuffer | Uint8Array, replayName: string) => Uint8Array;
