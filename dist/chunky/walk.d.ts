import { BinaryReader } from "../binary/reader";
/** Absolute byte offset where the first Relic Chunky region begins in a CoH1 body. */
export declare const HEADER_CHUNKY_OFFSET = 76;
/**
 * Location of a length-prefixed UTF-16LE string inside a Relic Chunky tree,
 * plus ancestor `chunkLength` field offsets that must be adjusted on splice.
 */
export type UnicodeStringLocation = {
    /** Offset of the u32 length prefix. */
    stringStart: number;
    /** Offset just past the UTF-16LE payload. */
    stringEnd: number;
    /** Offsets of ancestor FOLD/DATA chunkLength u32 fields. */
    chunkLengthOffsets: number[];
};
/** Result of one step of {@link walkChunky}. */
export type ChunkyWalkResult<T> = {
    /** Non-null when the handler requested an early stop with this value. */
    value: T | null;
    /** False when the next bytes are not a FOLD/DATA chunk. */
    advanced: boolean;
};
/**
 * Callback invoked for each DATA* chunk during a Relic Chunky walk.
 * Return a non-null value to stop the walk early and bubble that value up.
 */
export type DataChunkHandler<T> = (chunkType: string, chunkVersion: number, dataStart: number, chunkLength: number, chunkLengthOffsets: number[], stream: BinaryReader) => T | null;
/**
 * Encodes a string as a Relic length-prefixed UTF-16LE blob
 * (`u32` char count + payload).
 *
 * @param value - Unicode string to encode.
 * @returns New byte array ready to splice into a chunky payload.
 */
export declare const encodeLengthPrefixedUnicode: (value: string) => Uint8Array;
/**
 * Attempts to enter a Relic Chunky v3 container at the current stream position.
 * On success the stream is left at the first child chunk; on failure the
 * position is restored.
 *
 * @param stream - Binary reader positioned at a potential "Relic Chunky" signature.
 * @returns `true` if a v3 chunky header was consumed.
 */
export declare const tryEnterChunky: (stream: BinaryReader) => boolean;
/**
 * Recursively walks Relic FOLD/DATA chunks from the current stream position.
 * `onDataChunk` may return a value to stop the walk early.
 *
 * @param stream - Reader positioned at a FOLD or DATA chunk header.
 * @param ancestors - Offsets of parent `chunkLength` fields (for splice tooling).
 * @param onDataChunk - Handler for DATA payloads.
 * @returns Walk result with optional early-exit value.
 */
export declare const walkChunky: <T>(stream: BinaryReader, ancestors: number[], onDataChunk: DataChunkHandler<T>) => ChunkyWalkResult<T>;
/**
 * Visits every DATA chunk in both header Relic Chunky regions (starting at
 * {@link HEADER_CHUNKY_OFFSET}). The handler's return value is ignored; use
 * {@link findInHeaderChunky} when you need an early-exit value.
 *
 * @param body - Stripped CoH replay body.
 * @param onDataChunk - Invoked for each DATA* chunk.
 */
export declare const forEachHeaderDataChunk: (body: Uint8Array, onDataChunk: DataChunkHandler<unknown>) => void;
/**
 * Scans both header Relic Chunky regions for the first non-null value returned
 * by `onDataChunk`. Shared by rename / map-path mutators and parse tooling.
 *
 * @param body - Stripped CoH replay body.
 * @param onDataChunk - Return a non-null value to stop and yield it.
 * @returns The first handler result, or `null` if none matched.
 */
export declare const findInHeaderChunky: <T>(body: Uint8Array, onDataChunk: DataChunkHandler<T>) => T | null;
/**
 * Replaces a length-prefixed UTF-16LE string and bumps ancestor `chunkLength`
 * fields by the size delta. Returns a **new** buffer.
 *
 * Does not preserve FKSTMETA — operate on a stripped body, then re-embed.
 *
 * @param body - Stripped CoH body.
 * @param location - String span + ancestor length offsets from a chunky walk.
 * @param value - Replacement Unicode string.
 * @returns Rewritten body bytes.
 */
export declare const spliceLengthPrefixedUnicode: (body: Uint8Array, location: UnicodeStringLocation, value: string) => Uint8Array;
/**
 * Reads a length-prefixed UTF-16LE string at an absolute `stringStart` offset
 * without moving a stream cursor. Returns `""` on invalid / oversized counts.
 *
 * @param body - Byte buffer containing the string.
 * @param stringStart - Offset of the `u32` character-count prefix.
 * @returns Decoded string, or empty on bounds / sanity failure.
 */
export declare const readLengthPrefixedUnicodeAt: (body: Uint8Array, stringStart: number) => string;
