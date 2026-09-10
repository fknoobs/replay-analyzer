import { DEFINITIONS } from "./definitions";
const UNIT_DEF = {
    type: "UNIT",
    def: DEFINITIONS.UNIT,
    fallback: "Unknown Unit",
};
const BUILDING_DEF = {
    type: "BUILDING",
    def: DEFINITIONS.BUILDING,
    fallback: "Unknown Building",
};
const DOCTRINAL_DEF = {
    type: "DOCTRINAL",
    def: DEFINITIONS.DOCTRINAL,
    fallback: "Unknown Doctrinal",
};
const UPGRADE_DEF = {
    type: "UPGRADE",
    def: DEFINITIONS.UPGRADE,
    fallback: "Unknown Upgrade",
};
const SPECIAL_ABILITY_DEF = {
    type: "SPECIAL_ABILITY",
    def: DEFINITIONS.SPECIAL_ABILITY,
    fallback: "Unknown Special Ability",
};
const UNIT_COMMAND_DEF = {
    type: "UNIT_COMMAND",
    def: DEFINITIONS.UNIT_COMMAND,
    fallback: "Unknown Unit Command",
};
const DYNAMIC_BY_COMMAND_ID = {
    0x3: UNIT_DEF,
    0x52: UNIT_DEF,
    0x57: BUILDING_DEF,
    0x64: BUILDING_DEF,
    0x62: DOCTRINAL_DEF,
    0x34: UPGRADE_DEF,
    0x14: UPGRADE_DEF,
    0x5f: SPECIAL_ABILITY_DEF,
    0x37: UNIT_COMMAND_DEF,
};
/**
 * Command `type` strings that never carry world coordinates.
 * Used to skip expensive float scanning during decode.
 */
export const COMMANDS_WITHOUT_POSITION = new Set([
    "UNIT",
    "BUILDING",
    "DOCTRINAL",
    "UPGRADE",
    "SPECIAL_ABILITY",
    "UNIT_COMMAND",
    "HALT_COMMAND",
    "RETREAT_COMMAND",
    "AI_TAKEOVER",
]);
/**
 * Resolves well-known static (non-table) commands from opcode + object ID
 * (move, capture, halt, AI takeover, …).
 *
 * @param commandId - Packet command opcode.
 * @param objectId - Packet subtype / object ID.
 * @returns A {@link Command} label, or `undefined` when unrecognized.
 */
export const resolveStaticCommand = (commandId, objectId) => {
    switch (commandId) {
        case 0x2d:
            if (objectId === 0x2 || objectId === 0x4) {
                return {
                    type: "MOVE_COMMAND",
                    name: "Move",
                    description: "Ordered a unit to move",
                };
            }
            break;
        case 0x31:
            return {
                type: "CAPTURE_COMMAND",
                name: "Capture",
                description: "Ordered a unit to capture a point",
            };
        case 0x0f:
            if (objectId === 0x2 || objectId === 0x3) {
                return {
                    type: "RALLY_POINT_COMMAND",
                    name: "Rally Point",
                    description: "Set a rally point",
                };
            }
            break;
        case 0x2e:
            if (objectId === 0x0) {
                return {
                    type: "HALT_COMMAND",
                    name: "Halt",
                    description: "Ordered a unit to halt",
                };
            }
            break;
        case 0x36:
            if (objectId === 0x2) {
                return {
                    type: "ATTACK_MOVE_COMMAND",
                    name: "Attack Move",
                    description: "Ordered a unit to attack move",
                };
            }
            break;
        case 0x32:
            if (objectId === 0x2 || objectId === 0x4) {
                return {
                    type: "GROUND_ATTACK_COMMAND",
                    name: "Ground Attack",
                    description: "Ordered a unit to ground attack",
                };
            }
            break;
        case 0x3f:
            if (objectId === 0x0) {
                return {
                    type: "RETREAT_COMMAND",
                    name: "Retreat",
                    description: "Ordered a unit to retreat",
                };
            }
            break;
        case 0x3a:
            if (objectId === 0x3) {
                return {
                    type: "GET_IN_STRUCTURE_COMMAND",
                    name: "Get In Structure",
                    description: "Ordered a unit to get in structure",
                };
            }
            break;
        case 0x19:
            if (objectId === 0x0) {
                return {
                    type: "GET_OUT_OF_STRUCTURE_COMMAND",
                    name: "Get Out Of Structure",
                    description: "Ordered a unit to get out of structure",
                };
            }
            break;
        case 0x6a:
            if (objectId === 0x4) {
                return {
                    type: "AI_TAKEOVER",
                    name: "AI Takeover",
                    description: "Player has been taken over by AI",
                };
            }
            break;
    }
    return undefined;
};
/**
 * Resolves a command label from dynamic definition tables or static opcode rules.
 *
 * @param commandId - Packet command opcode.
 * @param objectId - Packet subtype / object ID.
 * @returns Command label, or `undefined` when unknown.
 */
export const resolveCommand = (commandId, objectId) => {
    const dynamic = DYNAMIC_BY_COMMAND_ID[commandId];
    if (dynamic) {
        const def = dynamic.def[objectId];
        return {
            type: dynamic.type,
            name: def?.name || dynamic.fallback,
            description: def?.description || "",
        };
    }
    return resolveStaticCommand(commandId, objectId);
};
/**
 * Resolves the action subtype / objectId from a command packet.
 *
 * Simple packets store objectId at offset 14 (after a 1-byte entity count and
 * 1-byte payload size at offsets 12–13).
 *
 * Multi-entity packets start at offset 8 with `0x40 | entityCount`, followed by
 * `entityCount` little-endian u32 entity handles. The count/size/objectId
 * triplet then follows; a trailing `0xff` means objectId 0 (halt/retreat).
 *
 * @param data - Raw packet bytes.
 * @param commandId - Already-decoded command opcode (affects capture layout).
 * @param packetLength - Declared packet size.
 * @returns Unsigned object ID (0 when missing / truncated).
 */
export const extractObjectId = (data, commandId, packetLength) => {
    const len = Math.min(data.length, packetLength);
    if (len < 15)
        return 0;
    let objectOffset = 14;
    if (len > 8 && (data[8] & 0xf0) === 0x40) {
        const entityCount = data[8] & 0x0f;
        const afterEntities = 9 + entityCount * 4;
        if (afterEntities >= len)
            return 0;
        if (data[afterEntities] === 0xff)
            return 0;
        objectOffset = afterEntities + 2;
    }
    if (commandId === 0x31) {
        return objectOffset < len ? data[objectOffset] : 0;
    }
    if (objectOffset + 4 <= len) {
        return ((data[objectOffset] |
            (data[objectOffset + 1] << 8) |
            (data[objectOffset + 2] << 16) |
            (data[objectOffset + 3] << 24)) >>>
            0);
    }
    return objectOffset < len ? data[objectOffset] : 0;
};
const isValidCoord = (n) => {
    if (!Number.isFinite(n))
        return false;
    const abs = Math.abs(n);
    if (abs > 2048)
        return false;
    if (abs > 0 && abs < 0.01)
        return false;
    return true;
};
/**
 * Scans a command packet for a plausible world-space `{ x, y, z }` float triple.
 *
 * Prefers offsets after the typical objectId triplet (~18+), then falls back to
 * a full scan. Rejects non-finite / out-of-range / near-zero triples.
 *
 * @param data - Raw packet bytes.
 * @param packetLength - Declared packet size.
 * @returns First valid coordinate triple, or `undefined`.
 */
export const extractPosition = (data, packetLength) => {
    const len = Math.min(data.length, packetLength);
    if (len < 12)
        return undefined;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tryAt = (i) => {
        const x = view.getFloat32(i, true);
        const y = view.getFloat32(i + 4, true);
        const z = view.getFloat32(i + 8, true);
        if (!isValidCoord(x) || !isValidCoord(y) || !isValidCoord(z)) {
            return undefined;
        }
        if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z) > 0.01) {
            return { x, y, z };
        }
        return undefined;
    };
    // Typical layouts put xyz after the objectId triplet (~offset 18+)
    const preferredStart = Math.min(18, Math.max(0, len - 12));
    for (let i = preferredStart; i <= len - 12; i++) {
        const hit = tryAt(i);
        if (hit)
            return hit;
    }
    for (let i = 0; i < preferredStart; i++) {
        const hit = tryAt(i);
        if (hit)
            return hit;
    }
    return undefined;
};
/**
 * Decodes one raw action packet into a lean {@link Action}.
 *
 * Always resolves command type internally for position gating; attaches
 * `command` only when `enrichCommands` is true.
 *
 * @param tick - Owning engine tick.
 * @param data - Packet bytes (typically a subarray of a tick block).
 * @param absoluteOffset - Absolute offset in the stripped replay body.
 * @param packetLength - Declared packet length.
 * @param enrichCommands - Whether to attach a `command` label.
 * @returns Decoded action object.
 */
export const decodeAction = (tick, data, absoluteOffset, packetLength, enrichCommands) => {
    const commandId = packetLength >= 3 ? data[2] : 0;
    const playerId = packetLength >= 6 ? data[4] | (data[5] << 8) : 0;
    const objectId = extractObjectId(data, commandId, packetLength);
    const resolved = resolveCommand(commandId, objectId);
    const position = resolved !== undefined && COMMANDS_WITHOUT_POSITION.has(resolved.type)
        ? undefined
        : extractPosition(data, packetLength);
    return {
        tick,
        playerId,
        commandId,
        objectId,
        offset: absoluteOffset,
        packetLength,
        command: enrichCommands ? resolved : undefined,
        position,
    };
};
