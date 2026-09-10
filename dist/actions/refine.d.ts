import type { Action, Player } from "../types";
/**
 * Applies faction-aware refinements that need player IDs already linked:
 * overloaded command `0x3` / object `3` (HMG burst vs repair), and
 * `UNIT_COMMAND` `factionVariants` from the definition tables.
 *
 * No-ops for actions without a `command` label (`enrichCommands: false`).
 *
 * @param actions - Actions to mutate in place.
 * @param players - Linked players (for faction lookup by `id`).
 */
export declare const refineActionDefinitions: (actions: Action[], players: Player[]) => void;
