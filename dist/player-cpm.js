/**
 * UNIT_COMMAND (0x37) object IDs that Replay Manager's C2A backend filters as
 * non-input / aura spam ("tons of crap" without `-n`).
 */
export const CPM_EXCLUDED_UNIT_COMMAND_IDS = new Set([
    0xc4, // LT Maintain Command Range
    0xc5, // Captain Maintain Command Range
    0xc6, // Tank / CCT Maintain Command Range
    0xc7, // Maintain Support Range (MH)
    0xc8, // Maintain Support Range
    0xa8, // Set Up Truck
]);
export const isAiTakeoverAction = (action) => action.command?.type === "AI_TAKEOVER";
/** True for actions that must not contribute to CPM. */
export const isCpmExcludedAction = (action) => {
    if (isAiTakeoverAction(action))
        return true;
    return (action.commandID === 0x37 &&
        CPM_EXCLUDED_UNIT_COMMAND_IDS.has(action.objectID));
};
/**
 * Player actions up to and including the first AI takeover (C2A truncates here).
 * Callers that only want human inputs should also apply {@link isCpmExcludedAction}.
 */
export const actionsUntilAiTakeover = (actions, playerId) => {
    const playerActions = actions.filter((a) => a.playerID === playerId);
    const idx = playerActions.findIndex(isAiTakeoverAction);
    return idx >= 0 ? playerActions.slice(0, idx + 1) : playerActions;
};
/** Actions that may count toward CPM (after takeover cut + spam filter). */
export const cpmEligibleActions = (actions, playerId) => actionsUntilAiTakeover(actions, playerId).filter((a) => !isCpmExcludedAction(a));
/**
 * C2A-style command count: unique `(tick, commandID, objectID)` among eligible
 * actions. Collapses multi-entity / repeated packets on the same tick.
 */
export const countCpmCommands = (actions, playerId) => {
    const keys = new Set();
    for (const a of cpmEligibleActions(actions, playerId)) {
        keys.add(`${a.tick}|${a.commandID}|${a.objectID}`);
    }
    return keys.size;
};
/**
 * Minutes used as the CPM divisor: time of first AI takeover when present,
 * otherwise full replay duration.
 */
export const cpmDurationMinutes = (actions, playerId, replayDurationSeconds) => {
    const takeover = actions.find((a) => a.playerID === playerId && isAiTakeoverAction(a));
    if (takeover) {
        return Math.max(takeover.tick / 8 / 60, 1 / 60);
    }
    return Math.max(replayDurationSeconds / 60, 1 / 60);
};
/**
 * Commands-per-minute aligned with Replay Manager / C2A.EXE:
 * deduped eligible commands ÷ minutes until AI takeover (or match end).
 */
export const playerCpm = (replay, playerId) => {
    if (playerId == null || !(replay.duration > 0))
        return 0;
    const count = countCpmCommands(replay.actions, playerId);
    if (count === 0)
        return 0;
    const minutes = cpmDurationMinutes(replay.actions, playerId, replay.duration);
    return Math.round(count / minutes);
};
/** String form used by UI overviews (`"99"`). */
export const playerCpmLabel = (replay, playerId) => String(playerCpm(replay, playerId));
