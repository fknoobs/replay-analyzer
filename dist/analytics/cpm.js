/**
 * UNIT_COMMAND (`0x37`) object IDs that Replay Manager's C2A backend filters as
 * non-input / aura spam ("tons of crap" without `-n`).
 *
 * These must not contribute to {@link playerCpm} / {@link countCpmCommands}.
 */
export const CPM_EXCLUDED_UNIT_COMMAND_IDS = new Set([
    0xc4, // LT Maintain Command Range
    0xc5, // Captain Maintain Command Range
    0xc6, // Tank / CCT Maintain Command Range
    0xc7, // Maintain Support Range (MH)
    0xc8, // Maintain Support Range
    0xa8, // Set Up Truck
]);
/**
 * Returns whether an action is an AI takeover packet.
 *
 * Detects either an enriched `command.type === "AI_TAKEOVER"` label or the raw
 * opcode pair `commandId === 0x6a && objectId === 0x4` (works with
 * `enrichCommands: false`).
 *
 * @param action - Action (or CPM subset) to test.
 * @returns `true` if this packet is an AI takeover.
 */
export const isAiTakeoverAction = (action) => action.command?.type === "AI_TAKEOVER" ||
    (action.commandId === 0x6a && action.objectId === 0x4);
/**
 * Returns whether an action must be excluded from CPM counting.
 *
 * Excludes AI takeover packets and aura / non-input `UNIT_COMMAND`s listed in
 * {@link CPM_EXCLUDED_UNIT_COMMAND_IDS}.
 *
 * @param action - Action (or CPM subset) to test.
 * @returns `true` if the action must not contribute to CPM.
 */
export const isCpmExcludedAction = (action) => {
    if (isAiTakeoverAction(action))
        return true;
    return (action.commandId === 0x37 &&
        CPM_EXCLUDED_UNIT_COMMAND_IDS.has(action.objectId));
};
/**
 * Returns a player's actions up to and including the first AI takeover.
 *
 * Matches C2A behavior: after takeover, further human inputs are ignored for CPM.
 * If no takeover exists, all of that player's actions are returned.
 *
 * @param actions - Full action stream.
 * @param playerId - Action player ID to filter.
 * @returns Slice of that player's actions through the takeover packet.
 */
export const actionsUntilAiTakeover = (actions, playerId) => {
    const playerActions = actions.filter((a) => a.playerId === playerId);
    const idx = playerActions.findIndex(isAiTakeoverAction);
    return idx >= 0 ? playerActions.slice(0, idx + 1) : playerActions;
};
/**
 * Actions that may count toward CPM after takeover cut + spam filter.
 * The takeover packet itself is excluded via {@link isCpmExcludedAction}.
 *
 * @param actions - Full action stream.
 * @param playerId - Action player ID to filter.
 * @returns Eligible actions for that player.
 */
export const cpmEligibleActions = (actions, playerId) => actionsUntilAiTakeover(actions, playerId).filter((a) => !isCpmExcludedAction(a));
/**
 * C2A-style command count: unique `(tick, commandId, objectId)` among eligible
 * actions. Collapses multi-entity / repeated packets on the same tick.
 *
 * @param actions - Full action stream.
 * @param playerId - Action player ID to count.
 * @returns Number of unique command keys.
 */
export const countCpmCommands = (actions, playerId) => {
    const keys = new Set();
    for (const a of cpmEligibleActions(actions, playerId)) {
        keys.add(`${a.tick}|${a.commandId}|${a.objectId}`);
    }
    return keys.size;
};
/**
 * Minutes used as the CPM divisor: time of first AI takeover when present,
 * otherwise full replay duration. Floored to at least `1/60` minute.
 *
 * @param actions - Full action stream (for takeover detection).
 * @param playerId - Player whose takeover tick is considered.
 * @param replayDurationSeconds - Full match length from {@link Replay.durationSeconds}.
 * @returns Positive minute divisor for CPM.
 */
export const cpmDurationMinutes = (actions, playerId, replayDurationSeconds) => {
    const takeover = actions.find((a) => a.playerId === playerId && isAiTakeoverAction(a));
    if (takeover) {
        return Math.max(takeover.tick / 8 / 60, 1 / 60);
    }
    return Math.max(replayDurationSeconds / 60, 1 / 60);
};
/**
 * Commands-per-minute aligned with Replay Manager / `C2A.EXE`:
 * deduped eligible commands ÷ minutes until AI takeover (or match end).
 *
 * Returns `0` when `playerId` is nullish, duration is non-positive, or the
 * player has no eligible commands (including early-dropout takeover-only cases).
 *
 * @param replay - Parsed replay (needs `actions` + `durationSeconds`).
 * @param playerId - Linked action player ID, or `null` / `undefined`.
 * @returns Rounded CPM integer.
 *
 * @example
 * for (const p of replay.players) {
 *   console.log(p.name, playerCpm(replay, p.id));
 * }
 */
export const playerCpm = (replay, playerId) => {
    if (playerId == null || !(replay.durationSeconds > 0))
        return 0;
    const count = countCpmCommands(replay.actions, playerId);
    if (count === 0)
        return 0;
    const minutes = cpmDurationMinutes(replay.actions, playerId, replay.durationSeconds);
    return Math.round(count / minutes);
};
/**
 * String form of {@link playerCpm} used by UI overviews (`"99"`).
 *
 * @param replay - Parsed replay (needs `actions` + `durationSeconds`).
 * @param playerId - Linked action player ID, or `null` / `undefined`.
 * @returns Decimal string of the rounded CPM value.
 */
export const playerCpmLabel = (replay, playerId) => String(playerCpm(replay, playerId));
