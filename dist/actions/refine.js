import { DEFINITIONS, isUnitCommand } from "./definitions";
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
export const refineActionDefinitions = (actions, players) => {
    const playerFactionMap = new Map();
    for (const p of players) {
        if (p.id !== undefined && p.id !== 0 && p.faction) {
            playerFactionMap.set(p.id, p.faction);
        }
    }
    for (const action of actions) {
        if (!action.command)
            continue;
        if (action.commandId === 0x3 && action.objectId === 3) {
            const faction = playerFactionMap.get(action.playerId);
            if (faction === "axis_panzer_elite") {
                action.command = {
                    type: "UNIT_COMMAND",
                    name: "Repair and Recovery Vehicle",
                    description: "Ordered to repair a vehicle or structure",
                };
            }
            else if (faction === "allies") {
                if (action.packetLength > 20) {
                    action.command = {
                        type: "UNIT_COMMAND",
                        name: "Repair vehicle/structure",
                        description: "Ordered to repair a vehicle or structure",
                    };
                }
            }
        }
        if (isUnitCommand(action.commandId)) {
            const faction = playerFactionMap.get(action.playerId);
            if (!faction)
                continue;
            const baseDef = DEFINITIONS.UNIT_COMMAND[action.objectId];
            if (baseDef?.factionVariants?.[faction]) {
                const variant = baseDef.factionVariants[faction];
                action.command = {
                    type: action.command.type || "UNIT_COMMAND",
                    name: variant.name,
                    description: variant.description,
                };
            }
        }
    }
};
