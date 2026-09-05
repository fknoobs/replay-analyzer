import { embedReplayMetadata, extractReplayMetadata, } from "./replay-metadata";
import { ReplayStream } from "./replay-stream";
const HEADER_CHUNKY_OFFSET = 76;
/** Fixed bytes before the length-prefixed replayName in DATABASE v0xb. */
const DATABASE_PREFIX_BYTES = 41;
const encodeLengthPrefixedUnicode = (value) => {
    const charCount = value.length;
    const out = new Uint8Array(4 + charCount * 2);
    const view = new DataView(out.buffer);
    view.setUint32(0, charCount, true);
    for (let i = 0; i < charCount; i++) {
        view.setUint16(4 + i * 2, value.charCodeAt(i), true);
    }
    return out;
};
const tryEnterChunky = (stream) => {
    const pos = stream.position;
    if (pos + 12 > stream.length)
        return false;
    const signature = stream.readASCIIStr(12);
    if (signature !== "Relic Chunky") {
        stream.seek(pos);
        return false;
    }
    stream.skip(4);
    const version = stream.readUInt32();
    if (version !== 3) {
        stream.seek(pos);
        return false;
    }
    stream.skip(4);
    const length = stream.readUInt32();
    stream.skip(length - 28);
    return true;
};
/**
 * Walks one Relic chunk (and nested FOLD children), mirroring parseChunk.
 * `ancestors` holds chunkLength field offsets of open FOLD/DATA ancestors.
 */
const walkChunk = (stream, ancestors) => {
    if (stream.position + 8 > stream.length) {
        return { location: null, advanced: false };
    }
    const chunkStart = stream.position;
    const chunkType = stream.readASCIIStr(8);
    if (!(chunkType.startsWith("FOLD") || chunkType.startsWith("DATA"))) {
        stream.seek(chunkStart);
        return { location: null, advanced: false };
    }
    const chunkVersion = stream.readUInt32();
    const chunkLengthOffset = stream.position;
    const chunkLength = stream.readUInt32();
    const chunkNameLength = stream.readUInt32();
    stream.skip(8);
    if (chunkNameLength > 0) {
        stream.skip(chunkNameLength);
    }
    const dataStart = stream.position;
    const nextAncestors = [...ancestors, chunkLengthOffset];
    if (chunkType.startsWith("FOLD")) {
        const foldEnd = dataStart + chunkLength;
        while (stream.position < foldEnd) {
            const child = walkChunk(stream, nextAncestors);
            if (child.location) {
                return { location: child.location, advanced: true };
            }
            if (!child.advanced)
                break;
        }
    }
    else if (chunkType.startsWith("DATABASE") && chunkVersion === 0xb) {
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
            location: {
                stringStart,
                stringEnd: stream.position,
                chunkLengthOffsets: nextAncestors,
            },
            advanced: true,
        };
    }
    stream.seek(dataStart + chunkLength);
    return { location: null, advanced: true };
};
const locateReplayName = (body) => {
    const stream = new ReplayStream(body);
    stream.seek(HEADER_CHUNKY_OFFSET);
    for (let i = 0; i < 2; i++) {
        if (!tryEnterChunky(stream)) {
            break;
        }
        while (true) {
            const result = walkChunk(stream, []);
            if (result.location)
                return result.location;
            if (!result.advanced)
                break;
        }
    }
    throw new Error("Could not locate DATABASE replayName in replay header");
};
/**
 * Rewrites the CoH1 header `replayName` (length-prefixed UTF-16LE in DATABASE).
 * Preserves any existing FKSTMETA trailer. Returns a new Uint8Array.
 */
export const setReplayName = (input, replayName) => {
    const { body, metadata } = extractReplayMetadata(input);
    const location = locateReplayName(body);
    const encoded = encodeLengthPrefixedUnicode(replayName);
    const delta = encoded.length - (location.stringEnd - location.stringStart);
    const rewritten = new Uint8Array(body.length + delta);
    rewritten.set(body.subarray(0, location.stringStart), 0);
    rewritten.set(encoded, location.stringStart);
    rewritten.set(body.subarray(location.stringEnd), location.stringStart + encoded.length);
    if (delta !== 0) {
        const view = new DataView(rewritten.buffer, rewritten.byteOffset, rewritten.byteLength);
        for (const offset of location.chunkLengthOffsets) {
            // Length fields sit before the spliced string, so offsets are unchanged.
            const prev = view.getUint32(offset, true);
            view.setUint32(offset, prev + delta, true);
        }
    }
    if (metadata) {
        return embedReplayMetadata(rewritten, metadata);
    }
    return rewritten;
};
