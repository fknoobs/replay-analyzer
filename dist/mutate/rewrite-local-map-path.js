import { embedReplayMetadata, extractReplayMetadata, stripReplayMetadata, } from "../metadata/fkstmeta";
import { findInHeaderChunky, readLengthPrefixedUnicodeAt, spliceLengthPrefixedUnicode, } from "../chunky/walk";
const MY_GAMES_COH_RE = /\\My Games\\Company of Heroes/i;
const ARCHIVE_EXT_RE = /\.(sga|sgb)$/i;
const ABS_WIN_PATH_RE = /^[A-Za-z]:\\/;
/**
 * Default Documents root for the current machine (Node / Electron).
 *
 * Uses `%USERPROFILE%\Documents` on Windows or `$HOME/Documents` elsewhere.
 * Returns `undefined` in browsers where `process.env` is unavailable.
 *
 * @returns Absolute Documents path, or `undefined` when not detectable.
 */
export const defaultLocalDocumentsRoot = () => {
    if (typeof process === "undefined" || !process.env)
        return undefined;
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home)
        return undefined;
    const sep = home.includes("\\") ? "\\" : "/";
    return `${home.replace(/[/\\]+$/, "")}${sep}Documents`;
};
/**
 * Rewrites a foreign CoH map-archive path to the local Documents tree,
 * preserving everything from `\My Games\Company of Heroes…` onward.
 *
 * @param foreignPath - Absolute Windows path embedding a CoH My Games suffix.
 * @param localDocuments - Local Documents root (with or without trailing slash).
 * @returns Rewritten absolute path, or `null` if the input is not a CoH archive path.
 *
 * @example
 * toLocalMapArchivePath(
 *   "C:\\Users\\oscar\\Documents\\My Games\\Company of Heroes Relaunch\\…\\map.sga",
 *   "C:\\Users\\You\\Documents",
 * );
 */
export const toLocalMapArchivePath = (foreignPath, localDocuments) => {
    const idx = foreignPath.search(MY_GAMES_COH_RE);
    if (idx < 0)
        return null;
    if (!ARCHIVE_EXT_RE.test(foreignPath))
        return null;
    const docs = localDocuments.replace(/[/\\]+$/, "");
    const suffix = foreignPath.slice(idx);
    const winDocs = docs.replace(/\//g, "\\");
    return `${winDocs}${suffix.replace(/\//g, "\\")}`;
};
/** @internal */
const isMapArchivePath = (value) => ABS_WIN_PATH_RE.test(value) &&
    MY_GAMES_COH_RE.test(value) &&
    ARCHIVE_EXT_RE.test(value);
/**
 * Scans DATASDSC for absolute CoH map-archive UTF-16 strings.
 * @internal
 */
const locateMapArchivePaths = (body) => {
    const hits = [];
    findInHeaderChunky(body, (chunkType, chunkVersion, dataStart, chunkLength, chunkLengthOffsets) => {
        if (!(chunkType.startsWith("DATASDSC") && chunkVersion === 0x7d4)) {
            return null;
        }
        const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
        const dataEnd = dataStart + chunkLength;
        for (let pos = dataStart; pos + 8 <= dataEnd;) {
            const n = view.getUint32(pos, true);
            if (n < 24 || n > 512 || pos + 4 + n * 2 > dataEnd) {
                pos += 1;
                continue;
            }
            const c0 = view.getUint16(pos + 4, true);
            const c1 = view.getUint16(pos + 6, true);
            const isDrive = ((c0 >= 0x41 && c0 <= 0x5a) ||
                (c0 >= 0x61 && c0 <= 0x7a)) &&
                c1 === 0x3a;
            if (!isDrive) {
                pos += 1;
                continue;
            }
            const value = readLengthPrefixedUnicodeAt(body, pos);
            if (isMapArchivePath(value)) {
                hits.push({
                    stringStart: pos,
                    stringEnd: pos + 4 + n * 2,
                    chunkLengthOffsets,
                });
                pos += 4 + n * 2;
                continue;
            }
            pos += 1;
        }
        return true;
    });
    return hits;
};
/**
 * Finds absolute CoH map-archive paths (`.sga` / `.sgb` under My Games)
 * embedded in the DATASDSC header chunk.
 *
 * Workshop / custom maps store these after the fixed DATASDSC fields; the tail
 * layout varies, so this scans length-prefixed UTF-16 strings.
 *
 * @param input - `.rec` bytes (FKSTMETA is stripped before scanning).
 * @returns Each path with its byte span in the stripped body.
 */
export const findMapArchivePaths = (input) => {
    const { body } = extractReplayMetadata(input);
    return locateMapArchivePaths(body).map((hit) => ({
        path: readLengthPrefixedUnicodeAt(body, hit.stringStart),
        stringStart: hit.stringStart,
        stringEnd: hit.stringEnd,
    }));
};
/**
 * Rewrites foreign absolute map-archive paths inside DATASDSC to the local
 * Documents tree. Preserves any FKSTMETA trailer on the returned bytes.
 *
 * When no Documents root is available (browser without `localDocuments`),
 * returns a copy of the input with an empty `rewritten` list.
 *
 * @param input - `.rec` bytes to rewrite.
 * @param options - Optional Documents root override.
 * @returns Rewritten bytes plus a list of path changes.
 */
export const rewriteLocalMapArchivePaths = (input, options = {}) => {
    const localDocuments = options.localDocuments?.trim() || defaultLocalDocumentsRoot();
    if (!localDocuments) {
        return {
            bytes: input instanceof Uint8Array
                ? input.slice()
                : new Uint8Array(input).slice(),
            rewritten: [],
        };
    }
    const { body, metadata } = extractReplayMetadata(input);
    const hits = locateMapArchivePaths(body);
    let next = body;
    const rewritten = [];
    for (const hit of [...hits].sort((a, b) => b.stringStart - a.stringStart)) {
        const from = readLengthPrefixedUnicodeAt(next, hit.stringStart);
        const to = toLocalMapArchivePath(from, localDocuments);
        if (!to || to === from)
            continue;
        next = spliceLengthPrefixedUnicode(next, hit, to);
        rewritten.push({ from, to });
    }
    return {
        bytes: metadata ? embedReplayMetadata(next, metadata) : next,
        rewritten,
    };
};
/**
 * Prepares a replay for local CoH / Replay Manager playback:
 * strips any FKSTMETA trailer and rewrites foreign workshop map-archive paths.
 *
 * @param input - `.rec` bytes (may include FKSTMETA and foreign paths).
 * @param options - Optional Documents root override.
 * @returns Trailer-free bytes plus path rewrite log.
 *
 * @example
 * const { bytes } = prepareForLocalCoh(upload, {
 *   localDocuments: "C:\\Users\\You\\Documents",
 * });
 * // Hand `bytes` to CoH
 */
export const prepareForLocalCoh = (input, options = {}) => {
    const stripped = stripReplayMetadata(input);
    return rewriteLocalMapArchivePaths(stripped, options);
};
