import type { Action, ReplayData } from "./replay-types";
/**
 * UNIT_COMMAND (0x37) object IDs that Replay Manager's C2A backend filters as
 * non-input / aura spam ("tons of crap" without `-n`).
 */
export declare const CPM_EXCLUDED_UNIT_COMMAND_IDS: ReadonlySet<number>;
export type CpmAction = Pick<Action, "tick" | "playerID" | "commandID" | "objectID" | "command">;
export declare const isAiTakeoverAction: (action: CpmAction) => boolean;
/** True for actions that must not contribute to CPM. */
export declare const isCpmExcludedAction: (action: CpmAction) => boolean;
/**
 * Player actions up to and including the first AI takeover (C2A truncates here).
 * Callers that only want human inputs should also apply {@link isCpmExcludedAction}.
 */
export declare const actionsUntilAiTakeover: <T extends CpmAction>(actions: readonly T[], playerId: number) => T[];
/** Actions that may count toward CPM (after takeover cut + spam filter). */
export declare const cpmEligibleActions: <T extends CpmAction>(actions: readonly T[], playerId: number) => T[];
/**
 * C2A-style command count: unique `(tick, commandID, objectID)` among eligible
 * actions. Collapses multi-entity / repeated packets on the same tick.
 */
export declare const countCpmCommands: (actions: readonly CpmAction[], playerId: number) => number;
/**
 * Minutes used as the CPM divisor: time of first AI takeover when present,
 * otherwise full replay duration.
 */
export declare const cpmDurationMinutes: (actions: readonly CpmAction[], playerId: number, replayDurationSeconds: number) => number;
/**
 * Commands-per-minute aligned with Replay Manager / C2A.EXE:
 * deduped eligible commands ÷ minutes until AI takeover (or match end).
 */
export declare const playerCpm: (replay: Pick<ReplayData, "actions" | "duration">, playerId: number | null | undefined) => number;
/** String form used by UI overviews (`"99"`). */
export declare const playerCpmLabel: (replay: Pick<ReplayData, "actions" | "duration">, playerId: number | null | undefined) => string;
