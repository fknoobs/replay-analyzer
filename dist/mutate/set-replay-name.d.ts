/**
 * Rewrites the official CoH1 header `replayName` (length-prefixed UTF-16LE
 * inside the `DATABASE` chunk) and bumps ancestor Relic Chunky length fields.
 *
 * Any existing FKSTMETA trailer is preserved on the returned buffer. The new
 * name is visible in CoH and Replay Manager (unlike FKSTMETA-only edits).
 *
 * @param input - `.rec` bytes (body and optional trailer).
 * @param replayName - New title to write (may be empty).
 * @returns A new `Uint8Array` with the updated header (and restored trailer).
 * @throws If the DATABASE chunk / string cannot be located or is truncated.
 *
 * @example
 * const out = setReplayName(bytes, "My custom replay title");
 * writeFileSync("out.rec", out);
 */
export declare const setReplayName: (input: ArrayBuffer | Uint8Array, replayName: string) => Uint8Array;
