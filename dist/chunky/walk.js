import { BinaryReader } from "../binary/reader";
/** Absolute byte offset where the first Relic Chunky region begins in a CoH1 body. */
export const HEADER_CHUNKY_OFFSET = 76;
/**
 * Encodes a string as a Relic length-prefixed UTF-16LE blob
 * (`u32` char count + payload).
 *
 * @param value - Unicode string to encode.
 * @returns New byte array ready to splice into a chunky payload.
 */
export const encodeLengthPrefixedUnicode = (value) => {
    const charCount = value.length;
    const out = new Uint8Array(4 + charCount * 2);
    const view = new DataView(out.buffer);
    view.setUint32(0, charCount, true);
    for (let i = 0; i < charCount; i++) {
        view.setUint16(4 + i * 2, value.charCodeAt(i), true);
    }
    return out;
};
/**
 * Attempts to enter a Relic Chunky v3 container at the current stream position.
 * On success the stream is left at the first child chunk; on failure the
 * position is restored.
 *
 * @param stream - Binary reader positioned at a potential "Relic Chunky" signature.
 * @returns `true` if a v3 chunky header was consumed.
 */
export const tryEnterChunky = (stream) => {
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
 * Recursively walks Relic FOLD/DATA chunks from the current stream position.
 * `onDataChunk` may return a value to stop the walk early.
 *
 * @param stream - Reader positioned at a FOLD or DATA chunk header.
 * @param ancestors - Offsets of parent `chunkLength` fields (for splice tooling).
 * @param onDataChunk - Handler for DATA payloads.
 * @returns Walk result with optional early-exit value.
 */
export const walkChunky = (stream, ancestors, onDataChunk) => {
    if (stream.position + 8 > stream.length) {
        return { value: null, advanced: false };
    }
    const chunkStart = stream.position;
    const chunkType = stream.readASCIIStr(8);
    if (!(chunkType.startsWith("FOLD") || chunkType.startsWith("DATA"))) {
        stream.seek(chunkStart);
        return { value: null, advanced: false };
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
            const child = walkChunky(stream, nextAncestors, onDataChunk);
            if (child.value !== null) {
                return { value: child.value, advanced: true };
            }
            if (!child.advanced)
                break;
        }
    }
    else {
        const found = onDataChunk(chunkType, chunkVersion, dataStart, chunkLength, nextAncestors, stream);
        if (found !== null) {
            return { value: found, advanced: true };
        }
    }
    stream.seek(dataStart + chunkLength);
    return { value: null, advanced: true };
};
/**
 * Visits every DATA chunk in both header Relic Chunky regions (starting at
 * {@link HEADER_CHUNKY_OFFSET}). The handler's return value is ignored; use
 * {@link findInHeaderChunky} when you need an early-exit value.
 *
 * @param body - Stripped CoH replay body.
 * @param onDataChunk - Invoked for each DATA* chunk.
 */
export const forEachHeaderDataChunk = (body, onDataChunk) => {
    const stream = new BinaryReader(body);
    stream.seek(HEADER_CHUNKY_OFFSET);
    for (let i = 0; i < 2; i++) {
        if (!tryEnterChunky(stream))
            break;
        while (true) {
            const result = walkChunky(stream, [], (type, ver, start, len, offs, s) => {
                onDataChunk(type, ver, start, len, offs, s);
                return null;
            });
            if (!result.advanced)
                break;
        }
    }
};
/**
 * Scans both header Relic Chunky regions for the first non-null value returned
 * by `onDataChunk`. Shared by rename / map-path mutators and parse tooling.
 *
 * @param body - Stripped CoH replay body.
 * @param onDataChunk - Return a non-null value to stop and yield it.
 * @returns The first handler result, or `null` if none matched.
 */
export const findInHeaderChunky = (body, onDataChunk) => {
    const stream = new BinaryReader(body);
    stream.seek(HEADER_CHUNKY_OFFSET);
    for (let i = 0; i < 2; i++) {
        if (!tryEnterChunky(stream))
            break;
        while (true) {
            const result = walkChunky(stream, [], onDataChunk);
            if (result.value !== null)
                return result.value;
            if (!result.advanced)
                break;
        }
    }
    return null;
};
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
export const spliceLengthPrefixedUnicode = (body, location, value) => {
    const encoded = encodeLengthPrefixedUnicode(value);
    const delta = encoded.length - (location.stringEnd - location.stringStart);
    const rewritten = new Uint8Array(body.length + delta);
    rewritten.set(body.subarray(0, location.stringStart), 0);
    rewritten.set(encoded, location.stringStart);
    rewritten.set(body.subarray(location.stringEnd), location.stringStart + encoded.length);
    if (delta !== 0) {
        const view = new DataView(rewritten.buffer, rewritten.byteOffset, rewritten.byteLength);
        for (const offset of location.chunkLengthOffsets) {
            view.setUint32(offset, view.getUint32(offset, true) + delta, true);
        }
    }
    return rewritten;
};
/**
 * Reads a length-prefixed UTF-16LE string at an absolute `stringStart` offset
 * without moving a stream cursor. Returns `""` on invalid / oversized counts.
 *
 * @param body - Byte buffer containing the string.
 * @param stringStart - Offset of the `u32` character-count prefix.
 * @returns Decoded string, or empty on bounds / sanity failure.
 */
export const readLengthPrefixedUnicodeAt = (body, stringStart) => {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const charCount = view.getUint32(stringStart, true);
    if (charCount < 0 || charCount > 512)
        return "";
    if (stringStart + 4 + charCount * 2 > body.length)
        return "";
    let s = "";
    for (let i = 0; i < charCount; i++) {
        s += String.fromCharCode(view.getUint16(stringStart + 4 + i * 2, true));
    }
    return s;
};
