import type { BinaryReader } from "../binary/reader";
import type { RelicLadderPlayer } from "../types";
/**
 * Relic CoH 2.700+ / Replay Manager may store a `0x0BADC0DE` binary blob after
 * the "matchname" key instead of a plain lobby name (`"automatch"`, …).
 *
 * Layout (minianalyzer.cpp):
 * - `u32` magic `0x0BADC0DE`
 * - `u8` version (=1), `u8` loglevel (1–3), `u8` nplayers
 * - per player: `u64` steamId, `u8` mpn, `u16` rankBefore, `u16` rankAfter,
 *   `u8` level, `u8` result
 */
/** Little-endian magic for Replay Manager ladder blobs (`0x0BADC0DE`). */
export declare const RELIC_BINARY_BLOB_MAGIC = 195936478;
/**
 * Attempts to parse a BADCOE ladder payload at the current stream position.
 * Always consumes exactly `payloadLength` bytes (seek-restored on failure paths).
 *
 * @param stream - Reader positioned at the start of the matchname value payload.
 * @param payloadLength - Declared ASCII/blob length from the length prefix.
 * @returns Parsed ladder rows, or `undefined` when magic / version / size fail.
 */
export declare const readRelicLadderPlayers: (stream: BinaryReader, payloadLength: number) => RelicLadderPlayer[] | undefined;
/**
 * Reads the lobby / matchname value after the DATABASE `matchname` key.
 *
 * Printable ASCII names become `matchType`. A BADCOE blob yields empty
 * `matchType` plus optional `ladder` rows. Non-printable binary that is not
 * BADCOE is rejected as an empty match type.
 *
 * @param stream - Reader positioned at the length-prefixed matchname value.
 * @returns `{ matchType, ladder? }`.
 * @throws {RangeError} When the declared length exceeds the remaining buffer.
 */
export declare const readLobbyMatchType: (stream: BinaryReader) => {
    matchType: string;
    ladder?: RelicLadderPlayer[];
};
