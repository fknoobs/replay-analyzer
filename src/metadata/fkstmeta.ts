/**
 * Optional metadata trailer appended after the official CoH1 replay bytes.
 *
 * Wire layout (end of file):
 * ```
 * [original CoH replay body]
 * [JSON UTF-8 payload]
 * [u32 LE jsonByteLength]
 * [u32 LE version]          // currently 1
 * [8 ASCII magic "FKSTMETA"]
 * ```
 *
 * The game tick stream never sees this trailer because parsers strip it before
 * reading. CoH / Replay Manager cannot open files that still have the trailer —
 * use {@link resetReplayMetadata} or {@link prepareForLocalCoh} for game exports.
 */

const MAGIC = new TextEncoder().encode("FKSTMETA");
const TRAILER_VERSION = 1;
const TRAILER_FOOTER_SIZE = 8 + 4 + 4;

/**
 * JSON payload stored in an FKSTMETA trailer.
 * Keys are player lobby names; matching at apply-time is trim + case-insensitive.
 */
export type ReplayMetadata = {
    /** Name → Steam ID map (empty string values are dropped on embed). */
    steamIdsByName: Record<string, string>;
    /**
     * Name → action player ID corrections for ambiguous teammates
     * (integer IDs; `0` is rejected).
     */
    playerIdsByName: Record<string, number>;
};

/**
 * Result of stripping / inspecting a possible FKSTMETA trailer.
 */
export type ExtractedReplay = {
    /** Bytes the official CoH parser should read (trailer stripped when present). */
    body: Uint8Array;
    /** Parsed metadata, or `null` if absent / unreadable. */
    metadata: ReplayMetadata | null;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

/** @internal */
const endsWithMagic = (bytes: Uint8Array): boolean => {
    if (bytes.length < MAGIC.length) return false;
    const start = bytes.length - MAGIC.length;
    for (let i = 0; i < MAGIC.length; i++) {
        if (bytes[start + i] !== MAGIC[i]) return false;
    }
    return true;
};

/** @internal */
const cleanSteamIdsByName = (
    map: Record<string, string> | undefined,
): Record<string, string> => {
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return Object.fromEntries(
        Object.entries(map).filter(
            ([name, id]) =>
                typeof name === "string" &&
                name.trim().length > 0 &&
                typeof id === "string" &&
                id.trim().length > 0,
        ),
    );
};

/** @internal */
const cleanPlayerIdsByName = (
    map: Record<string, number> | undefined,
): Record<string, number> => {
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return Object.fromEntries(
        Object.entries(map).filter(
            ([name, id]) =>
                typeof name === "string" &&
                name.trim().length > 0 &&
                typeof id === "number" &&
                Number.isInteger(id) &&
                id !== 0,
        ),
    );
};

/** @internal */
const normalizeMetadata = (
    parsed: Partial<ReplayMetadata> | null | undefined,
): ReplayMetadata => ({
    steamIdsByName: cleanSteamIdsByName(parsed?.steamIdsByName),
    playerIdsByName: cleanPlayerIdsByName(parsed?.playerIdsByName),
});

/**
 * Splits a `.rec` buffer into the official CoH body and optional FKSTMETA metadata.
 *
 * - No magic footer → `{ body: input, metadata: null }`.
 * - Valid framing + parseable JSON → `{ body, metadata }`.
 * - Valid framing but corrupt JSON → still returns stripped `body` with
 *   `metadata: null` so callers can recover a CoH-readable file.
 *
 * @param input - Full file bytes, possibly including a trailer.
 * @returns Stripped body plus metadata when available.
 */
export const extractReplayMetadata = (
    input: ArrayBuffer | Uint8Array,
): ExtractedReplay => {
    const bytes =
        input instanceof Uint8Array ? input : new Uint8Array(input);

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

    const body = bytes.subarray(0, jsonStart);

    try {
        const jsonText = textDecoder.decode(
            bytes.subarray(jsonStart, jsonStart + jsonLength),
        );
        const parsed = JSON.parse(jsonText) as Partial<ReplayMetadata>;
        return {
            body,
            metadata: normalizeMetadata(parsed),
        };
    } catch {
        return { body, metadata: null };
    }
};

/**
 * Returns whether the buffer ends with a valid FKSTMETA footer framing
 * (magic + version + plausible JSON length), even if the JSON payload is corrupt.
 *
 * Prefer {@link hasReplayMetadata} when you need parseable metadata content.
 *
 * @param input - File bytes to inspect.
 * @returns `true` when trailer framing is present and version matches.
 */
export const hasReplayMetadataTrailer = (
    input: ArrayBuffer | Uint8Array,
): boolean => {
    const bytes =
        input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < TRAILER_FOOTER_SIZE || !endsWithMagic(bytes)) {
        return false;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(bytes.length - 8 - 4, true);
    const jsonLength = view.getUint32(bytes.length - 8 - 8, true);
    if (version !== TRAILER_VERSION) return false;
    const jsonStart = bytes.length - TRAILER_FOOTER_SIZE - jsonLength;
    return jsonLength >= 2 && jsonStart >= 0;
};

/**
 * Returns whether the buffer has a FKSTMETA trailer with successfully parsed metadata.
 *
 * @param input - File bytes to inspect.
 * @returns `true` only when {@link extractReplayMetadata} yields non-null metadata.
 */
export const hasReplayMetadata = (input: ArrayBuffer | Uint8Array): boolean =>
    extractReplayMetadata(input).metadata !== null;

/**
 * Returns the official CoH replay body with any FKSTMETA trailer removed.
 *
 * The returned buffer may be a view into `input` (not a copy). Use
 * {@link resetReplayMetadata} when you need a detached copy for saving.
 *
 * @param input - File bytes, with or without a trailer.
 * @returns CoH-readable body bytes.
 */
export const stripReplayMetadata = (
    input: ArrayBuffer | Uint8Array,
): Uint8Array => extractReplayMetadata(input).body;

/**
 * Removes custom FKSTMETA metadata and returns a **detached copy** of the
 * official CoH1 replay body (safe to write as a `.rec` for the game).
 *
 * Does **not** undo prior {@link setReplayName} edits on the body. Callers that
 * need a pristine restore should keep the original upload bytes separately.
 *
 * @param input - File bytes, with or without a trailer.
 * @returns A new `Uint8Array` containing only the CoH body.
 */
export const resetReplayMetadata = (
    input: ArrayBuffer | Uint8Array,
): Uint8Array => {
    const body = stripReplayMetadata(input);
    return body.slice();
};

/**
 * Appends (or replaces) a FKSTMETA trailer with the given metadata.
 *
 * Any existing trailer is stripped first so trailers never stack. Empty / invalid
 * map entries are cleaned before serialization.
 *
 * @param input - Existing `.rec` bytes (body and optional trailer).
 * @param metadata - Steam and/or player-ID maps to persist.
 * @returns A new `Uint8Array` suitable for saving as a `.rec` file.
 */
export const embedReplayMetadata = (
    input: ArrayBuffer | Uint8Array,
    metadata: ReplayMetadata,
): Uint8Array => {
    const body = stripReplayMetadata(input);
    const payload: ReplayMetadata = normalizeMetadata(metadata);
    const jsonBytes = textEncoder.encode(JSON.stringify(payload));

    const out = new Uint8Array(
        body.length + jsonBytes.length + TRAILER_FOOTER_SIZE,
    );
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
 * Writes (or replaces) Steam IDs in the FKSTMETA trailer.
 * Preserves any existing `playerIdsByName` entries from a prior trailer.
 *
 * @param input - Existing `.rec` bytes.
 * @param steamIdsByName - Name → Steam ID map (empty values dropped).
 * @returns New file bytes with an updated trailer.
 */
export const embedPlayerSteamIds = (
    input: ArrayBuffer | Uint8Array,
    steamIdsByName: Record<string, string>,
): Uint8Array => {
    const existing = extractReplayMetadata(input).metadata;
    return embedReplayMetadata(input, {
        steamIdsByName,
        playerIdsByName: existing?.playerIdsByName ?? {},
    });
};

/**
 * Writes (or replaces) action player-ID overrides in the FKSTMETA trailer.
 * Preserves any existing `steamIdsByName` entries from a prior trailer.
 *
 * @param input - Existing `.rec` bytes.
 * @param playerIdsByName - Name → action player ID map (`0` rejected).
 * @returns New file bytes with an updated trailer.
 */
export const embedPlayerIds = (
    input: ArrayBuffer | Uint8Array,
    playerIdsByName: Record<string, number>,
): Uint8Array => {
    const existing = extractReplayMetadata(input).metadata;
    return embedReplayMetadata(input, {
        steamIdsByName: existing?.steamIdsByName ?? {},
        playerIdsByName,
    });
};
