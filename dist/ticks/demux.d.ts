import type { BinaryReader } from "../binary/reader";
import type { Replay } from "../types";
/**
 * Demuxes the post-header tick/chat stream into `replay.actions` / `replay.chat`
 * and sets `durationSeconds` / `meta.dataOk`.
 *
 * Markers: `0` = tick packet, `1` = chat message; other values are skipped
 * (old-format / unknown) without aborting. Truncated tails stop cleanly.
 *
 * @param stream - Reader positioned at the start of the data stream.
 * @param replay - Mutable accumulate target.
 * @param enrichCommands - When true, attach command labels during decode.
 */
export declare const parseTickStream: (stream: BinaryReader, replay: Replay, enrichCommands: boolean) => void;
