/**
 * Options for rewriting foreign workshop map-archive paths to the local machine.
 */
export type RewriteLocalMapPathOptions = {
    /**
     * Local Documents folder, e.g. `C:\Users\You\Documents`.
     * Defaults to {@link defaultLocalDocumentsRoot} when omitted / empty.
     */
    localDocuments?: string;
};
/**
 * Result of a map-path rewrite pass.
 */
export type RewriteLocalMapPathResult = {
    /** Possibly rewritten file bytes (FKSTMETA preserved when present). */
    bytes: Uint8Array;
    /** Each absolute path that was changed (`from` → `to`). */
    rewritten: {
        from: string;
        to: string;
    }[];
};
/** Alias of {@link RewriteLocalMapPathOptions} for {@link prepareForLocalCoh}. */
export type PrepareForLocalCohOptions = RewriteLocalMapPathOptions;
/** Alias of {@link RewriteLocalMapPathResult} for {@link prepareForLocalCoh}. */
export type PrepareForLocalCohResult = RewriteLocalMapPathResult;
/**
 * Default Documents root for the current machine (Node / Electron).
 *
 * Uses `%USERPROFILE%\Documents` on Windows or `$HOME/Documents` elsewhere.
 * Returns `undefined` in browsers where `process.env` is unavailable.
 *
 * @returns Absolute Documents path, or `undefined` when not detectable.
 */
export declare const defaultLocalDocumentsRoot: () => string | undefined;
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
export declare const toLocalMapArchivePath: (foreignPath: string, localDocuments: string) => string | null;
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
export declare const findMapArchivePaths: (input: ArrayBuffer | Uint8Array) => {
    path: string;
    stringStart: number;
    stringEnd: number;
}[];
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
export declare const rewriteLocalMapArchivePaths: (input: ArrayBuffer | Uint8Array, options?: RewriteLocalMapPathOptions) => RewriteLocalMapPathResult;
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
export declare const prepareForLocalCoh: (input: ArrayBuffer | Uint8Array, options?: PrepareForLocalCohOptions) => PrepareForLocalCohResult;
