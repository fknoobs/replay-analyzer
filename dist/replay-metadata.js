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
const MAGIC = new TextEncoder().encode("FKSTMETA");
const TRAILER_VERSION = 1;
const TRAILER_FOOTER_SIZE = 8 + 4 + 4; // magic + version + jsonLen
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");
const endsWithMagic = (bytes) => {
    if (bytes.length < MAGIC.length)
        return false;
    const start = bytes.length - MAGIC.length;
    for (let i = 0; i < MAGIC.length; i++) {
        if (bytes[start + i] !== MAGIC[i])
            return false;
    }
    return true;
};
const cleanSteamIdsByName = (map) => {
    if (!map || typeof map !== "object" || Array.isArray(map))
        return {};
    return Object.fromEntries(Object.entries(map).filter(([name, id]) => typeof name === "string" &&
        name.trim().length > 0 &&
        typeof id === "string" &&
        id.trim().length > 0));
};
const cleanPlayerIdsByName = (map) => {
    if (!map || typeof map !== "object" || Array.isArray(map))
        return {};
    return Object.fromEntries(Object.entries(map).filter(([name, id]) => typeof name === "string" &&
        name.trim().length > 0 &&
        typeof id === "number" &&
        Number.isInteger(id) &&
        id !== 0));
};
const normalizeMetadata = (parsed) => ({
    steamIdsByName: cleanSteamIdsByName(parsed?.steamIdsByName),
    playerIdsByName: cleanPlayerIdsByName(parsed?.playerIdsByName),
});
/**
 * If a FKSTMETA trailer is present, returns the official body and parsed metadata.
 * Otherwise returns the full buffer as body with null metadata.
 */
export const extractReplayMetadata = (input) => {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < TRAILER_FOOTER_SIZE || !endsWithMagic(bytes)) {
        return { body: bytes, metadata: null };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(bytes.length - 8 - 4, true);
    const jsonLength = view.getUint32(bytes.length - 8 - 8, true);
    if (version !== TRAILER_VERSION) {
        return { body: bytes, metadata: null };
    }
    const jsonStart = bytes.length - TRAILER_FOOTER_SIZE - jsonLength;
    if (jsonLength < 2 || jsonStart < 0) {
        return { body: bytes, metadata: null };
    }
    try {
        const jsonText = textDecoder.decode(bytes.subarray(jsonStart, jsonStart + jsonLength));
        const parsed = JSON.parse(jsonText);
        return {
            body: bytes.subarray(0, jsonStart),
            metadata: normalizeMetadata(parsed),
        };
    }
    catch {
        return { body: bytes, metadata: null };
    }
};
/** Strips any existing FKSTMETA trailer; returns the official replay body (may be a view). */
export const stripReplayMetadata = (input) => extractReplayMetadata(input).body;
/** True when the buffer ends with a valid FKSTMETA trailer. */
export const hasReplayMetadata = (input) => extractReplayMetadata(input).metadata !== null;
/**
 * Removes custom FKSTMETA metadata and returns a detached copy of the original
 * CoH1 replay bytes (suitable for saving as a `.rec`).
 *
 * Does not undo official header edits such as `setReplayName`.
 */
export const resetReplayMetadata = (input) => {
    const body = stripReplayMetadata(input);
    return body.slice();
};
/**
 * Appends (or replaces) a FKSTMETA trailer with the given metadata.
 * Returns a new Uint8Array suitable for saving as a `.rec` file.
 */
export const embedReplayMetadata = (input, metadata) => {
    const body = stripReplayMetadata(input);
    const payload = normalizeMetadata(metadata);
    const jsonBytes = textEncoder.encode(JSON.stringify(payload));
    const out = new Uint8Array(body.length + jsonBytes.length + TRAILER_FOOTER_SIZE);
    out.set(body, 0);
    out.set(jsonBytes, body.length);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const footerStart = body.length + jsonBytes.length;
    view.setUint32(footerStart, jsonBytes.length, true);
    view.setUint32(footerStart + 4, TRAILER_VERSION, true);
    out.set(MAGIC, footerStart + 8);
    return out;
};
/**
 * Appends (or replaces) steam IDs in the FKSTMETA trailer.
 * Preserves any existing `playerIdsByName` entries.
 */
export const embedPlayerSteamIds = (input, steamIdsByName) => {
    const existing = extractReplayMetadata(input).metadata;
    return embedReplayMetadata(input, {
        steamIdsByName,
        playerIdsByName: existing?.playerIdsByName ?? {},
    });
};
/**
 * Appends (or replaces) action playerID overrides in the FKSTMETA trailer.
 * Preserves any existing `steamIdsByName` entries.
 */
export const embedPlayerIds = (input, playerIdsByName) => {
    const existing = extractReplayMetadata(input).metadata;
    return embedReplayMetadata(input, {
        steamIdsByName: existing?.steamIdsByName ?? {},
        playerIdsByName,
    });
};
