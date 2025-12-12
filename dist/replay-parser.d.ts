import { ReplayData } from "./replay-types";
export interface ParseOptions {
    includeHexData?: boolean;
}
/**
 * Parses the entire replay file.
 * @param input The replay file content as ArrayBuffer or Uint8Array.
 * @param options Optional configuration for parsing.
 * @returns The parsed ReplayData object.
 */
export declare const parseReplay: (input: ArrayBuffer | Uint8Array, options?: ParseOptions) => ReplayData;
/**
 * Parses only the header of the replay file.
 * @param input The replay file content as ArrayBuffer or Uint8Array.
 * @returns The ReplayData object with only header fields populated.
 */
export declare const parseHeader: (input: ArrayBuffer | Uint8Array) => ReplayData;
