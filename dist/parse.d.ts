import { type ParseOptions, type Replay } from "./types";
/**
 * Parses an entire CoH1 `.rec` file into a {@link Replay}.
 *
 * Pipeline:
 * 1. Strip any `FKSTMETA` trailer so the body is CoH-readable.
 * 2. Parse the fixed preamble + Relic Chunky header regions.
 * 3. Demux the tick/chat stream into `actions` / `chat` (unless `actions: false`).
 * 4. Link lobby players to action IDs and attach doctrines.
 * 5. Optionally enrich actions with command labels (`enrichCommands`, default on).
 * 6. Apply FKSTMETA Steam / player-ID overrides when present.
 *
 * Never throws to the caller: failures are recorded in `replay.meta.warnings`
 * and partial results are still returned.
 *
 * @param input - Raw `.rec` bytes (`ArrayBuffer` or `Uint8Array`).
 * @param options - Optional parse toggles; see {@link ParseOptions}.
 * @returns A populated {@link Replay} (check `meta.headerOk` / `meta.dataOk`).
 *
 * @example
 * const replay = parseReplay(bytes);
 * console.log(replay.header.mapName, replay.actions.length);
 *
 * @example
 * // Cheaper: skip command name tables
 * parseReplay(bytes, { enrichCommands: false });
 */
export declare const parseReplay: (input: ArrayBuffer | Uint8Array, options?: ParseOptions) => Replay;
/**
 * Parses only the CoH1 replay header (preamble + Relic Chunky regions).
 *
 * Skips the tick/action/chat stream entirely — useful for lobby listings,
 * rename tooling, and quick metadata reads. Still:
 * - strips `FKSTMETA` before reading;
 * - applies BADCOE ladder Steam / MPN→player ID links when present;
 * - applies FKSTMETA overrides onto `players`.
 *
 * `meta.dataOk` stays `false`; `actions` and `chat` remain empty.
 *
 * @param input - Raw `.rec` bytes (`ArrayBuffer` or `Uint8Array`).
 * @returns A {@link Replay} with header/players filled; check `meta.headerOk`.
 *
 * @example
 * const header = parseHeader(bytes);
 * console.log(header.header.replayName, header.players.map((p) => p.name));
 */
export declare const parseHeader: (input: ArrayBuffer | Uint8Array) => Replay;
