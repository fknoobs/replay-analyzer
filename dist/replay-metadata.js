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
/**
 * If a FKSTMETA trailer is present, returns the official body and parsed metadata.
 * Otherwise returns the full buffer as body with null metadata.
 */
export const extractReplayMetadata = (input) => {
    const bytes = input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
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
        const steamIdsByName = parsed.steamIdsByName &&
            typeof parsed.steamIdsByName === "object" &&
            !Array.isArray(parsed.steamIdsByName)
            ? Object.fromEntries(Object.entries(parsed.steamIdsByName).filter(([name, id]) => typeof name === "string" &&
                typeof id === "string" &&
                id.length > 0))
            : {};
        return {
            body: bytes.subarray(0, jsonStart),
            metadata: { steamIdsByName },
        };
    }
    catch {
        return { body: bytes, metadata: null };
    }
};
/** Strips any existing FKSTMETA trailer; returns the official replay body. */
export const stripReplayMetadata = (input) => extractReplayMetadata(input).body;
/**
 * Appends (or replaces) a FKSTMETA trailer with the given steam ID map.
 * Returns a new Uint8Array suitable for saving as a `.rec` file.
 */
export const embedPlayerSteamIds = (input, steamIdsByName) => {
    const body = stripReplayMetadata(input);
    const cleanedEntries = Object.fromEntries(Object.entries(steamIdsByName).filter(([name, id]) => typeof name === "string" &&
        name.trim().length > 0 &&
        typeof id === "string" &&
        id.trim().length > 0));
    const payload = { steamIdsByName: cleanedEntries };
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
