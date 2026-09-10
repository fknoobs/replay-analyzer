export type MapArchivePathHit = {
    /** Absolute Windows path as stored in DATASDSC. */
    path: string;
    /** Offset of the u32 length prefix. */
    stringStart: number;
    /** Offset just past the UTF-16LE payload. */
    stringEnd: number;
    /** chunkLength field offsets for DATASDSC (and ancestors if any). */
    chunkLengthOffsets: number[];
};
export type RewriteLocalMapPathOptions = {
    /**
     * Local Documents folder, e.g. `C:\Users\You\Documents`.
     * Defaults to `%USERPROFILE%\Documents` / `$HOME/Documents` when available.
     */
    localDocuments?: string;
};
export type RewriteLocalMapPathResult = {
    bytes: Uint8Array;
    rewritten: {
        from: string;
        to: string;
    }[];
};
/**
 * Default Documents root for the current machine (Node / Electron).
 * Returns undefined in browsers where env is unavailable.
 */
export declare const defaultLocalDocumentsRoot: () => string | undefined;
/**
 * Rewrite a foreign CoH map-archive path to the local Documents tree,
 * preserving everything from `\My Games\Company of Heroes…` onward.
 */
export declare const toLocalMapArchivePath: (foreignPath: string, localDocuments: string) => string | null;
/**
 * Find absolute CoH map-archive paths (`.sga` / `.sgb` under My Games) in DATASDSC.
 */
export declare const findMapArchivePaths: (input: ArrayBuffer | Uint8Array) => MapArchivePathHit[];
/**
 * Rewrites foreign absolute map-archive paths inside DATASDSC to the local
 * Documents tree (same subscription / map file under My Games\…).
 * Preserves any FKSTMETA trailer.
 */
export declare const rewriteLocalMapArchivePaths: (input: ArrayBuffer | Uint8Array, options?: RewriteLocalMapPathOptions) => RewriteLocalMapPathResult;
