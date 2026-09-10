import { embedReplayMetadata, extractReplayMetadata, } from "../metadata/fkstmeta";
import { findInHeaderChunky, spliceLengthPrefixedUnicode, } from "../chunky/walk";
/** Fixed bytes before the length-prefixed replayName in DATABASE v0xb. */
const DATABASE_PREFIX_BYTES = 41;
/**
 * Locates the DATABASE `replayName` string and its ancestor chunk-length fields.
 * @internal
 */
const locateReplayName = (body) => {
    const location = findInHeaderChunky(body, (chunkType, chunkVersion, dataStart, _len, chunkLengthOffsets, stream) => {
        if (!(chunkType.startsWith("DATABASE") && chunkVersion === 0xb)) {
            return null;
        }
        if (dataStart + DATABASE_PREFIX_BYTES + 4 > stream.length) {
            throw new RangeError("DATABASE chunk too short to contain replayName");
        }
        stream.seek(dataStart + DATABASE_PREFIX_BYTES);
        const stringStart = stream.position;
        const charCount = stream.readUInt32();
        if (charCount * 2 > stream.remaining()) {
            throw new RangeError(`replayName length ${charCount} exceeds remaining bytes`);
        }
        stream.skip(charCount * 2);
        return {
            stringStart,
            stringEnd: stream.position,
            chunkLengthOffsets,
        };
    });
    if (!location) {
        throw new Error("Could not locate DATABASE replayName in replay header");
    }
    return location;
};
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
export const setReplayName = (input, replayName) => {
    const { body, metadata } = extractReplayMetadata(input);
    const rewritten = spliceLengthPrefixedUnicode(body, locateReplayName(body), replayName);
    return metadata ? embedReplayMetadata(rewritten, metadata) : rewritten;
};
