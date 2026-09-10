import type { Action, Command, Vec3 } from "../types";
/**
 * Command `type` strings that never carry world coordinates.
 * Used to skip expensive float scanning during decode.
 */
export declare const COMMANDS_WITHOUT_POSITION: Set<string>;
/**
 * Resolves well-known static (non-table) commands from opcode + object ID
 * (move, capture, halt, AI takeover, …).
 *
 * @param commandId - Packet command opcode.
 * @param objectId - Packet subtype / object ID.
 * @returns A {@link Command} label, or `undefined` when unrecognized.
 */
export declare const resolveStaticCommand: (commandId: number, objectId: number) => Command | undefined;
/**
 * Resolves a command label from dynamic definition tables or static opcode rules.
 *
 * @param commandId - Packet command opcode.
 * @param objectId - Packet subtype / object ID.
 * @returns Command label, or `undefined` when unknown.
 */
export declare const resolveCommand: (commandId: number, objectId: number) => Command | undefined;
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
export declare const extractObjectId: (data: Uint8Array, commandId: number, packetLength: number) => number;
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
export declare const extractPosition: (data: Uint8Array, packetLength: number) => Vec3 | undefined;
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
export declare const decodeAction: (tick: number, data: Uint8Array, absoluteOffset: number, packetLength: number, enrichCommands: boolean) => Action;
