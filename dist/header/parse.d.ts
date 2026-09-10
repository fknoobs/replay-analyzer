import type { BinaryReader } from "../binary/reader";
import type { Replay } from "../types";
/**
 * Parses the fixed preamble + two Relic Chunky header regions into `replay`.
 *
 * Fills `replay.header`, appends DATAINFO players, and may set `replay.ladder`
 * when a BADCOE blob is present. Leaves the stream positioned at the start of
 * the tick/chat data stream. Sets `replay.meta.headerOk = true` on success.
 *
 * @param stream - Reader over the stripped CoH body (position 0).
 * @param replay - Mutable accumulate target (typically from {@link createEmptyReplay}).
 * @throws {RangeError} On truncated / malformed header data.
 */
export declare const parseHeaderInto: (stream: BinaryReader, replay: Replay) => void;
