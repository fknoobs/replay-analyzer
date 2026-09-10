import {
    embedReplayMetadata,
    extractReplayMetadata,
} from "./replay-metadata";
import { ReplayStream } from "./replay-stream";

const HEADER_CHUNKY_OFFSET = 76;

const MY_GAMES_COH_RE = /\\My Games\\Company of Heroes/i;
const ARCHIVE_EXT_RE = /\.(sga|sgb)$/i;

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
    rewritten: { from: string; to: string }[];
};

const encodeLengthPrefixedUnicode = (value: string): Uint8Array => {
    const charCount = value.length;
    const out = new Uint8Array(4 + charCount * 2);
    const view = new DataView(out.buffer);
    view.setUint32(0, charCount, true);
    for (let i = 0; i < charCount; i++) {
        view.setUint16(4 + i * 2, value.charCodeAt(i), true);
    }
    return out;
};

const tryEnterChunky = (stream: ReplayStream): boolean => {
    const pos = stream.position;
    if (pos + 12 > stream.length) return false;
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

const readUnicodeAt = (body: Uint8Array, stringStart: number): string => {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const charCount = view.getUint32(stringStart, true);
    if (charCount < 0 || charCount > 512) return "";
    if (stringStart + 4 + charCount * 2 > body.length) return "";
    let s = "";
    for (let i = 0; i < charCount; i++) {
        s += String.fromCharCode(
            view.getUint16(stringStart + 4 + i * 2, true),
        );
    }
    return s;
};

/**
 * Default Documents root for the current machine (Node / Electron).
 * Returns undefined in browsers where env is unavailable.
 */
export const defaultLocalDocumentsRoot = (): string | undefined => {
    if (typeof process === "undefined" || !process.env) return undefined;
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) return undefined;
    const sep = home.includes("\\") ? "\\" : "/";
    return `${home.replace(/[/\\]+$/, "")}${sep}Documents`;
};

/**
 * Rewrite a foreign CoH map-archive path to the local Documents tree,
 * preserving everything from `\My Games\Company of Heroes…` onward.
 */
export const toLocalMapArchivePath = (
    foreignPath: string,
    localDocuments: string,
): string | null => {
    const idx = foreignPath.search(MY_GAMES_COH_RE);
    if (idx < 0) return null;
    if (!ARCHIVE_EXT_RE.test(foreignPath)) return null;

    const docs = localDocuments.replace(/[/\\]+$/, "");
    const suffix = foreignPath.slice(idx); // begins with \My Games\...
    // Normalize to Windows separators used in CoH headers.
    const winDocs = docs.replace(/\//g, "\\");
    return `${winDocs}${suffix.replace(/\//g, "\\")}`;
};

const collectUnicodeStringsInRange = (
    body: Uint8Array,
    rangeStart: number,
    rangeEnd: number,
    chunkLengthOffsets: number[],
): MapArchivePathHit[] => {
    const hits: MapArchivePathHit[] = [];
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    let pos = rangeStart;
    while (pos + 4 <= rangeEnd) {
        const charCount = view.getUint32(pos, true);
        const payloadBytes = charCount * 2;
        if (
            charCount <= 0 ||
            charCount > 512 ||
            pos + 4 + payloadBytes > rangeEnd
        ) {
            pos += 1;
            continue;
        }

        let printable = true;
        let s = "";
        for (let i = 0; i < charCount; i++) {
            const c = view.getUint16(pos + 4 + i * 2, true);
            if (c < 32 || c > 0xfff) {
                printable = false;
                break;
            }
            s += String.fromCharCode(c);
        }

        if (
            printable &&
            MY_GAMES_COH_RE.test(s) &&
            ARCHIVE_EXT_RE.test(s) &&
            /^[A-Za-z]:\\/.test(s)
        ) {
            hits.push({
                path: s,
                stringStart: pos,
                stringEnd: pos + 4 + payloadBytes,
                chunkLengthOffsets: [...chunkLengthOffsets],
            });
            pos = pos + 4 + payloadBytes;
            continue;
        }

        pos += 1;
    }
    return hits;
};

type WalkResult = {
    hits: MapArchivePathHit[];
    advanced: boolean;
};

const walkChunk = (
    stream: ReplayStream,
    body: Uint8Array,
    ancestors: number[],
): WalkResult => {
    if (stream.position + 8 > stream.length) {
        return { hits: [], advanced: false };
    }

    const chunkStart = stream.position;
    const chunkType = stream.readASCIIStr(8);

    if (!(chunkType.startsWith("FOLD") || chunkType.startsWith("DATA"))) {
        stream.seek(chunkStart);
        return { hits: [], advanced: false };
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
    const hits: MapArchivePathHit[] = [];

    if (chunkType.startsWith("FOLD")) {
        const foldEnd = dataStart + chunkLength;
        while (stream.position < foldEnd) {
            const child = walkChunk(stream, body, nextAncestors);
            hits.push(...child.hits);
            if (!child.advanced) break;
        }
    } else if (chunkType.startsWith("DATASDSC") && chunkVersion === 0x7d4) {
        hits.push(
            ...collectUnicodeStringsInRange(
                body,
                dataStart,
                dataStart + chunkLength,
                nextAncestors,
            ),
        );
    }

    stream.seek(dataStart + chunkLength);
    return { hits, advanced: true };
};

/**
 * Find absolute CoH map-archive paths (`.sga` / `.sgb` under My Games) in DATASDSC.
 */
export const findMapArchivePaths = (
    input: ArrayBuffer | Uint8Array,
): MapArchivePathHit[] => {
    const { body } = extractReplayMetadata(input);
    const stream = new ReplayStream(body);
    stream.seek(HEADER_CHUNKY_OFFSET);

    const hits: MapArchivePathHit[] = [];
    for (let i = 0; i < 2; i++) {
        if (!tryEnterChunky(stream)) break;
        while (true) {
            const result = walkChunk(stream, body, []);
            hits.push(...result.hits);
            if (!result.advanced) break;
        }
    }
    return hits;
};

const spliceUnicodeString = (
    body: Uint8Array,
    hit: MapArchivePathHit,
    newValue: string,
): Uint8Array => {
    const encoded = encodeLengthPrefixedUnicode(newValue);
    const delta = encoded.length - (hit.stringEnd - hit.stringStart);
    const rewritten = new Uint8Array(body.length + delta);
    rewritten.set(body.subarray(0, hit.stringStart), 0);
    rewritten.set(encoded, hit.stringStart);
    rewritten.set(
        body.subarray(hit.stringEnd),
        hit.stringStart + encoded.length,
    );

    if (delta !== 0) {
        const view = new DataView(
            rewritten.buffer,
            rewritten.byteOffset,
            rewritten.byteLength,
        );
        for (const offset of hit.chunkLengthOffsets) {
            const prev = view.getUint32(offset, true);
            view.setUint32(offset, prev + delta, true);
        }
    }
    return rewritten;
};

/**
 * Rewrites foreign absolute map-archive paths inside DATASDSC to the local
 * Documents tree (same subscription / map file under My Games\…).
 * Preserves any FKSTMETA trailer.
 */
export const rewriteLocalMapArchivePaths = (
    input: ArrayBuffer | Uint8Array,
    options: RewriteLocalMapPathOptions = {},
): RewriteLocalMapPathResult => {
    const localDocuments =
        options.localDocuments?.trim() || defaultLocalDocumentsRoot();
    if (!localDocuments) {
        return {
            bytes:
                input instanceof Uint8Array
                    ? input.slice()
                    : new Uint8Array(input).slice(),
            rewritten: [],
        };
    }

    const { body, metadata } = extractReplayMetadata(input);
    const hits = findMapArchivePaths(body);
    if (hits.length === 0) {
        return {
            bytes: metadata ? embedReplayMetadata(body, metadata) : body.slice(),
            rewritten: [],
        };
    }

    // Apply from the end so earlier string offsets stay valid.
    const ordered = [...hits].sort((a, b) => b.stringStart - a.stringStart);
    let next = body;
    const rewritten: { from: string; to: string }[] = [];

    for (const hit of ordered) {
        // Re-read path at current offsets after prior splices when needed.
        // Because we go back-to-front, hit offsets remain valid on `next`
        // as long as we only mutate at/after stringStart.
        const currentPath = readUnicodeAt(next, hit.stringStart) || hit.path;
        const localPath = toLocalMapArchivePath(currentPath, localDocuments);
        if (!localPath || localPath === currentPath) continue;

        next = spliceUnicodeString(
            next,
            {
                ...hit,
                path: currentPath,
                // stringEnd must match currentPath encoding length
                stringEnd: hit.stringStart + 4 + currentPath.length * 2,
            },
            localPath,
        );
        rewritten.push({ from: currentPath, to: localPath });
    }

    // findMapArchivePaths was on original body; if we skipped some, still ok.
    // Re-verify by scanning result when we had hits but none rewritten.
    const outBytes = metadata ? embedReplayMetadata(next, metadata) : next;
    return { bytes: outBytes, rewritten };
};
