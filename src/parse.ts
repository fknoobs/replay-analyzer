import { BinaryReader } from "./binary/reader";
import { refineActionDefinitions } from "./actions/refine";
import { parseHeaderInto } from "./header/parse";
import { extractReplayMetadata } from "./metadata/fkstmeta";
import { applyPlayerIds } from "./players/apply-ids";
import { applyPlayerSteamIds } from "./players/apply-steam-ids";
import { applyRelicLadderPlayers, linkPlayerIds } from "./players/link-ids";
import { parseTickStream } from "./ticks/demux";
import {
    createEmptyReplay,
    type ParseOptions,
    type Replay,
} from "./types";

/**
 * Applies FKSTMETA name→ID / Steam maps onto an already-parsed replay.
 * @internal
 */
const applyMetadataOverrides = (
    replay: Replay,
    metadata: ReturnType<typeof extractReplayMetadata>["metadata"],
): void => {
    if (metadata?.playerIdsByName) {
        applyPlayerIds(replay, metadata.playerIdsByName);
    }
    if (metadata?.steamIdsByName) {
        applyPlayerSteamIds(replay, metadata.steamIdsByName);
    }
};

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
export const parseReplay = (
    input: ArrayBuffer | Uint8Array,
    options?: ParseOptions,
): Replay => {
    const enrichCommands = options?.enrichCommands !== false;
    const parseActions = options?.actions !== false;

    const { body, metadata } = extractReplayMetadata(input);
    const stream = new BinaryReader(body);
    const replay = createEmptyReplay();

    try {
        parseHeaderInto(stream, replay);

        if (parseActions) {
            parseTickStream(stream, replay, enrichCommands);
            linkPlayerIds(replay);
            if (enrichCommands) {
                refineActionDefinitions(replay.actions, replay.players);
            }
        } else {
            applyRelicLadderPlayers(replay.players, replay.ladder);
        }

        applyMetadataOverrides(replay, metadata);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        replay.meta.warnings.push(message);
    }

    return replay;
};

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
export const parseHeader = (input: ArrayBuffer | Uint8Array): Replay => {
    const { body, metadata } = extractReplayMetadata(input);
    const stream = new BinaryReader(body);
    const replay = createEmptyReplay();

    try {
        parseHeaderInto(stream, replay);
        applyRelicLadderPlayers(replay.players, replay.ladder);
        applyMetadataOverrides(replay, metadata);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        replay.meta.warnings.push(message);
    }

    return replay;
};
