import { type Action, type Player, type RelicLadderPlayer, type Replay } from "../types";
/**
 * Normalizes a player name for case-insensitive matching (trim + lower-case).
 * @param name - Raw lobby or chat name.
 * @returns Normalized lookup key.
 */
export declare const normalizePlayerName: (name: string) => string;
/**
 * Returns whether a player still lacks a usable action-stream ID.
 * Treats both `undefined` and `0` as unassigned (legacy / DATAINFO default).
 *
 * @param player - Player (or id-bearing subset) to test.
 */
export declare const isPlayerUnassigned: (player: {
    id?: number;
}) => boolean;
/**
 * Builds a map of action player ID → faction key by scanning unit-production
 * commands for faction-characteristic object IDs.
 *
 * @param actions - Decoded action stream.
 * @returns Map of playerId → faction string (`allies`, `axis`, …).
 */
export declare const buildIdFactionMap: (actions: readonly Action[]) => Map<number, string>;
/**
 * Infers a single action player ID's faction from the first matching unit
 * production command in the stream.
 *
 * @param actions - Decoded action stream.
 * @param id - Action player ID to inspect.
 * @returns Faction key, or `undefined` when no characteristic unit was found.
 */
export declare const inferIdFaction: (actions: readonly Action[], id: number) => string | undefined;
/**
 * Applies Replay Manager `0xBADC0DE` Steam IDs + MPN→playerId links when the
 * blob player count matches the header lobby order.
 *
 * For each lobby index `i`: sets `steamId` when missing, and assigns
 * `id = 1000 + mpn` to still-unassigned players (skipping claimed IDs / bad MPN).
 *
 * @param players - Header players to mutate (lobby order).
 * @param ladder - Ladder rows aligned with `players`, or `undefined`.
 */
export declare const applyRelicLadderPlayers: (players: Player[], ladder: RelicLadderPlayer[] | undefined) => void;
/**
 * Attaches `doctrine` / `doctrineName` on each linked player from the first
 * recognizable doctrinal action for that player ID. Clears doctrine fields on
 * unassigned players.
 *
 * @param players - Players to mutate.
 * @param actions - Action stream to scan (single pass).
 */
/**
 * Attaches `doctrine` / `doctrineName` on each linked player from the first
 * recognizable doctrinal action for that player ID. Clears doctrine fields on
 * unassigned players.
 *
 * @param players - Players to mutate.
 * @param actions - Action stream to scan (single pass).
 */
export declare const attachPlayerDoctrines: (players: Player[], actions: readonly Action[]) => void;
/**
 * Links header players to in-game action player IDs (`1000`–`1007`).
 *
 * Order of evidence:
 * 1. BADCOE ladder blob (MPN + Steam)
 * 2. Chat sender name ↔ playerId
 * 3. Fixed-start slot scheme (`1000 + slot`), or random-start when factions align
 * 4. Unique faction / side residuals
 *
 * Never assigns multiple same-faction teammates by sorted-ID ↔ lobby order —
 * that historically swapped Armor/Infantry on random-start 2v2 replays.
 * Ambiguous seats stay without `id`; use {@link getUnresolvedPlayerIds}.
 *
 * Also attaches doctrines via {@link attachPlayerDoctrines}.
 *
 * @param replay - Parsed replay with `players`, `chat`, `actions`, and optional `ladder`.
 */
export declare const linkPlayerIds: (replay: Replay) => void;
