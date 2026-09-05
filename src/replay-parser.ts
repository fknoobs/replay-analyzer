import { ReplayStream } from "./replay-stream";
import {
    ReplayData,
    createEmptyReplay,
    Action,
    getDoctrineName,
    type RelicLadderPlayer,
    type Command,
} from "./replay-types";
import {
    DEFINITIONS,
    isUnit,
    isUnitCommand,
    isDoctrinal,
} from "./action-definitions";
import { parseReplayDate } from "./parse-replay-date";
import { extractReplayMetadata } from "./replay-metadata";
import { applyPlayerSteamIds } from "./apply-player-steam-ids";
import { applyPlayerIds } from "./apply-player-ids";

export interface ParseOptions {
    /** @deprecated Hex payloads were removed; option is ignored. */
    includeHexData?: boolean;
}

/**
 * Parses the entire replay file.
 * @param input The replay file content as ArrayBuffer or Uint8Array.
 * @param options Optional configuration for parsing.
 * @returns The parsed ReplayData object.
 */
export const parseReplay = (
    input: ArrayBuffer | Uint8Array,
    options?: ParseOptions,
): ReplayData => {
    const { body, metadata } = extractReplayMetadata(input);
    const stream = new ReplayStream(body);
    const replay = createEmptyReplay();

    try {
        parseHeaderInternal(stream, replay);
        parseDataInternal(stream, replay, options);
        replay.dataParsed = true;
        findPlayerIDs(replay);
        refineActionDefinitions(replay);

        replay.players.forEach((player) => {
            player.doctrine =
                replay.actions.find(
                    (action) =>
                        isDoctrinal(action.commandID) &&
                        action.playerID === player.id &&
                        getDoctrineName(action.objectID) !== undefined,
                )?.objectID || undefined;

            if (player.doctrine !== undefined) {
                player.doctrineName = getDoctrineName(player.doctrine);
            }
        });

        if (metadata?.playerIdsByName) {
            applyPlayerIds(replay, metadata.playerIdsByName);
        }
        if (metadata?.steamIdsByName) {
            applyPlayerSteamIds(replay, metadata.steamIdsByName);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        replay.errors.push(message);
        console.error("Error parsing replay:", e);
    }

    return replay;
};

/**
 * Parses only the header of the replay file.
 * @param input The replay file content as ArrayBuffer or Uint8Array.
 * @returns The ReplayData object with only header fields populated.
 */
export const parseHeader = (input: ArrayBuffer | Uint8Array): ReplayData => {
    const { body, metadata } = extractReplayMetadata(input);
    const stream = new ReplayStream(body);
    const replay = createEmptyReplay();

    try {
        parseHeaderInternal(stream, replay);
        applyRelicLadderPlayers(replay);
        if (metadata?.playerIdsByName) {
            applyPlayerIds(replay, metadata.playerIdsByName);
        }
        if (metadata?.steamIdsByName) {
            applyPlayerSteamIds(replay, metadata.steamIdsByName);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        replay.errors.push(message);
        console.error("Error parsing replay header:", e);
    }
    return replay;
};

const parseHeaderInternal = (stream: ReplayStream, replay: ReplayData) => {
    replay.version = stream.readUInt32();
    replay.gameType = stream.readASCIIStr(8);

    // Decode date: C# code scans for null terminator in uint16 steps
    const startPos = stream.position;
    let length = 0;
    while (stream.has(2)) {
        if (stream.readUInt16() === 0) break;
        length++;
        // Sanity cap — dates are short; avoid scanning the whole file
        if (length > 256) {
            throw new RangeError("Replay date string exceeds maximum length");
        }
    }
    stream.seek(startPos);
    const dateStr = stream.readUnicodeStr(length);
    replay.gameDate = parseReplayDate(dateStr);
    if (stream.has(2)) {
        stream.readUInt16(); // Skip null terminator
    }

    stream.seek(76); // Fixed offset from C# code

    parseChunky(stream, replay);
    parseChunky(stream, replay);

    replay.headerParsed = true;
};

const parseChunky = (stream: ReplayStream, replay: ReplayData): boolean => {
    const pos = stream.position;
    if (pos + 12 > stream.length) return false;
    const signature = stream.readASCIIStr(12);
    if (signature !== "Relic Chunky") {
        stream.seek(pos);
        return false;
    }

    stream.skip(4);
    const version = stream.readUInt32();
    if (version !== 3) {
        stream.seek(pos);
        return false;
    }

    stream.skip(4);
    const length = stream.readUInt32();

    stream.skip(length - 28);

    while (parseChunk(stream, replay));

    return true;
};

const parseChunk = (stream: ReplayStream, replay: ReplayData): boolean => {
    if (stream.position + 8 > stream.length) return false;

    const chunkType = stream.readASCIIStr(8);

    if (!(chunkType.startsWith("FOLD") || chunkType.startsWith("DATA"))) {
        stream.skip(-8);
        return false;
    }

    const chunkVersion = stream.readUInt32();
    const chunkLength = stream.readUInt32();
    const chunkNameLength = stream.readUInt32();

    stream.skip(8);

    let chunkName = "";
    if (chunkNameLength > 0) {
        chunkName = stream.readASCIIStr(chunkNameLength);
    }

    const startPosition = stream.position;

    if (chunkType.startsWith("FOLD")) {
        while (stream.position < startPosition + chunkLength) {
            if (!parseChunk(stream, replay)) break;
        }
    } else if (chunkType.startsWith("DATA")) {
        processDataChunk(stream, replay, chunkType, chunkVersion);
    }

    stream.seek(startPosition + chunkLength);
    return true;
};

/**
 * Relic CoH 2.700+ / Replay Manager may store a 0x0BADC0DE binary blob after
 * the "matchname" key instead of a plain lobby name ("automatch", …).
 *
 * Replay Manager layout (minianalyzer.cpp):
 *   u32 magic 0x0BADC0DE
 *   u8 version (=1), u8 loglevel (1–3), u8 nplayers
 *   per player: u64 steamId, u8 mpn, u16 rankBefore, u16 rankAfter, u8 level, u8 result
 */
const RELIC_BINARY_BLOB_MAGIC = 0x0badc0de;

const readRelicLadderPlayers = (
    stream: ReplayStream,
    payloadLength: number,
): RelicLadderPlayer[] | undefined => {
    const payloadStart = stream.position;
    if (payloadLength < 7) {
        stream.skip(payloadLength);
        return undefined;
    }

    const magic = stream.readUInt32();
    if (magic !== RELIC_BINARY_BLOB_MAGIC) {
        stream.seek(payloadStart);
        return undefined;
    }

    try {
        const version = stream.readUInt8();
        const loglevel = stream.readUInt8();
        const nplayers = stream.readUInt8();
        if (version !== 1 || loglevel < 1 || loglevel > 3) {
            return undefined;
        }
        if (nplayers < 1 || nplayers > 8) {
            return undefined;
        }

        // Each record is 8+1+2+2+1+1 = 15 bytes
        const needed = 3 + nplayers * 15;
        if (needed > payloadLength - 4) {
            return undefined;
        }

        const players: RelicLadderPlayer[] = [];
        for (let i = 0; i < nplayers; i++) {
            const steamId = stream.readBigUInt64().toString();
            const mpn = stream.readUInt8();
            const rankingBefore = stream.readUInt16();
            const rankingAfter = stream.readUInt16();
            const level = stream.readUInt8();
            const result = stream.readUInt8();
            players.push({
                steamId,
                mpn,
                rankingBefore,
                rankingAfter,
                level,
                result,
            });
        }
        return players;
    } catch {
        return undefined;
    } finally {
        stream.seek(payloadStart + payloadLength);
    }
};

/** Lobby / match names are printable ASCII; reject binary payloads as empty. */
const readLobbyMatchType = (
    stream: ReplayStream,
    replay: ReplayData,
): string => {
    const length = stream.readUInt32();
    if (length === 0) return "";
    if (length > stream.remaining()) {
        throw new RangeError(
            `ASCII string length ${length} exceeds remaining ${stream.remaining()} bytes`,
        );
    }

    if (length >= 4) {
        const start = stream.position;
        const magic = stream.readUInt32();
        stream.seek(start);
        if (magic === RELIC_BINARY_BLOB_MAGIC) {
            const ladder = readRelicLadderPlayers(stream, length);
            if (ladder) {
                replay.relicLadderPlayers = ladder;
            }
            return "";
        }
    }

    const value = stream.readASCIIStr(length);
    return /^[\x20-\x7E]*$/.test(value) ? value : "";
};

const processDataChunk = (
    stream: ReplayStream,
    replay: ReplayData,
    type: string,
    version: number,
) => {
    if (type.startsWith("DATASDSC") && version === 0x7d4) {
        stream.skip(4);
        const len = stream.readUInt32();
        stream.skip(12 + 2 * len);

        replay.modName = stream.readLengthPrefixedASCIIStr();
        replay.mapFileName = stream.readLengthPrefixedASCIIStr();
        stream.skip(20);
        replay.mapName = stream.readLengthPrefixedUnicodeStr();
        replay.mapDescription = stream.readLengthPrefixedUnicodeStr();
        stream.skip(4);
        replay.mapWidth = stream.readUInt32();
        replay.mapHeight = stream.readUInt32();
    } else if (type.startsWith("DATABASE") && version === 0xb) {
        stream.skip(8);
        stream.skip(8);
        replay.randomStart = stream.readUInt32() === 0;
        stream.skip(4);
        replay.highResources = stream.readUInt32() === 1;
        stream.skip(4);
        const vpVal = stream.readUInt32();
        const clampedVp = Math.max(0, Math.min(vpVal, 8));
        replay.vpCount = 250 * (1 << clampedVp);
        stream.skip(5);
        replay.replayName = stream.readLengthPrefixedUnicodeStr();
        stream.skip(8);
        replay.vpGame = stream.readUInt32() === 0x603872a3;
        stream.skip(23);
        stream.readLengthPrefixedASCIIStr(); // gameminorversion
        stream.skip(4);
        stream.readLengthPrefixedASCIIStr(); // gamemajorversion
        stream.skip(8);
        if (stream.readUInt32() === 2) {
            stream.readLengthPrefixedASCIIStr(); // gameversion
            stream.readLengthPrefixedASCIIStr(); // date
        }
        stream.readLengthPrefixedASCIIStr(); // matchname key
        replay.matchType = readLobbyMatchType(stream, replay);
    } else if (type.startsWith("DATAINFO") && version === 6) {
        const playerName = stream.readLengthPrefixedUnicodeStr();
        // u1: 0 = host / recorder seat; other values are opaque (not the action playerID).
        // u2: team index (0 = allies side, 1 = axis side in observed replays).
        const u1 = stream.readUInt32();
        const u2 = stream.readUInt32();
        const faction = stream.readLengthPrefixedASCIIStr();

        addPlayer(replay, playerName, faction, 0, 0, u1, u2);
    }   
};

const addPlayer = (
    replay: ReplayData,
    name: string,
    faction: string,
    id: number = 0,
    doctrine: number = 0,
    dataInfo1: number = 0,
    dataInfo2: number = 0,
) => {
    replay.players.push({
        name,
        faction,
        id,
        slot: replay.players.length,
        doctrine,
        dataInfo1,
        dataInfo2,
    });
    replay.playerCount = replay.players.length;
};

const parseDataInternal = (
    stream: ReplayStream,
    replay: ReplayData,
    options?: ParseOptions,
) => {
    let tickIndex = 0;
    let tickCount = 0;

    while (stream.position < stream.length) {
        if (!stream.has(4)) break;

        const marker = stream.readUInt32();

        if (marker === 0) {
            // Tick Data
            if (!stream.has(4)) break;
            const tickLength = stream.readUInt32();
            if (tickLength === 0 || tickLength > 10000000) continue; // Safety

            // Truncated / incomplete tick — stop cleanly instead of reading past EOF
            if (!stream.has(tickLength)) break;

            const tickDataStart = stream.position;
            const tickData = stream.readBytes(tickLength);
            parseTick(tickData, tickDataStart, tickCount, replay);

            tickCount++;

            if (tickData.length >= 4) {
                // We need to read from the Uint8Array directly here since tickData is a subarray
                // DataView is needed for Little Endian reading
                const view = new DataView(
                    tickData.buffer,
                    tickData.byteOffset,
                    tickData.byteLength,
                );
                const newTickIndex = view.getUint32(0, true);

                if (newTickIndex < 4000000000) {
                    // Ignore suspicious high values
                    tickIndex = newTickIndex;
                }
            }
        } else if (marker === 1) {
            // Message
            if (!parseMessage(stream, replay, tickIndex)) break;
        } else {
            // Old format / unknown marker — already consumed 4 bytes; keep scanning
            continue;
        }
    }

    // If tickIndex is 0 (or invalid), fallback to tickCount
    if (tickIndex === 0 && tickCount > 0) {
        replay.duration = tickCount / 8;
    } else {
        replay.duration = tickIndex / 8;
    }

    const totalSeconds = Math.floor(replay.duration);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    replay.durationReadable = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const parseTick = (
    data: Uint8Array,
    tickDataStart: number,
    currentTickCount: number,
    replay: ReplayData,
) => {
    if (data.length < 16) return;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let tickId = view.getUint32(0, true);
    if (tickId >= 4000000000) {
        tickId = currentTickCount;
    }
    // Bytes 4-11 are timestamp
    const bundleCount = view.getUint32(12, true);
    const timestamp = formatTickTimestamp(tickId);

    let offset = 16;
    for (let i = 0; i < bundleCount; i++) {
        if (offset + 12 > data.length) break;

        // Skip bundle header (12 bytes)
        offset += 12;

        if (offset + 4 > data.length) break;

        const actionBlockSize = view.getUint32(offset, true);
        offset += 4;

        if (actionBlockSize > 0 && actionBlockSize < 65536) {
            offset += 1; // Skip duplicate byte

            const actionEnd = offset + actionBlockSize;
            if (actionEnd > data.length) break;

            parseActionsInBlock(
                tickId,
                timestamp,
                data,
                offset,
                actionEnd,
                tickDataStart,
                replay,
            );
            offset = actionEnd;
        } else {
            offset += 1; // Skip zero byte
        }
    }
};

const formatTickTimestamp = (tick: number): string => {
    const totalSeconds = Math.floor(tick / 8);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const parseActionsInBlock = (
    tick: number,
    timestamp: string,
    data: Uint8Array,
    startIndex: number,
    endIndex: number,
    tickDataStart: number,
    replay: ReplayData,
) => {
    let i = startIndex;
    const maxActions = 10000;
    let actionCount = 0;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    while (i + 2 <= endIndex && i + 2 <= data.length && actionCount < maxActions) {
        const actionLength = view.getUint16(i, true);

        if (actionLength <= 0 || actionLength > 1000) break;
        if (i + actionLength > endIndex || i + actionLength > data.length) break;

        addAction(
            replay,
            tick,
            timestamp,
            data.subarray(i, i + actionLength),
            tickDataStart + i,
            actionLength,
        );
        actionCount++;

        i += actionLength;
    }
};

type DynamicDef = {
    type: Command["type"];
    def: Record<number, { name: string; description: string } | undefined>;
    fallback: string;
};

const UNIT_DEF: DynamicDef = {
    type: "UNIT",
    def: DEFINITIONS.UNIT as DynamicDef["def"],
    fallback: "Unknown Unit",
};
const BUILDING_DEF: DynamicDef = {
    type: "BUILDING",
    def: DEFINITIONS.BUILDING as DynamicDef["def"],
    fallback: "Unknown Building",
};
const DOCTRINAL_DEF: DynamicDef = {
    type: "DOCTRINAL",
    def: DEFINITIONS.DOCTRINAL as DynamicDef["def"],
    fallback: "Unknown Doctrinal",
};
const UPGRADE_DEF: DynamicDef = {
    type: "UPGRADE",
    def: DEFINITIONS.UPGRADE as DynamicDef["def"],
    fallback: "Unknown Upgrade",
};
const SPECIAL_ABILITY_DEF: DynamicDef = {
    type: "SPECIAL_ABILITY",
    def: DEFINITIONS.SPECIAL_ABILITY as DynamicDef["def"],
    fallback: "Unknown Special Ability",
};
const UNIT_COMMAND_DEF: DynamicDef = {
    type: "UNIT_COMMAND",
    def: DEFINITIONS.UNIT_COMMAND as DynamicDef["def"],
    fallback: "Unknown Unit Command",
};

/** Fast path: commandID → definition table (avoids .find() per action). */
const DYNAMIC_BY_COMMAND_ID: Record<number, DynamicDef> = {
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

const COMMANDS_WITHOUT_POSITION = new Set([
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

const resolveStaticCommand = (
    commandID: number,
    objectID: number,
): Command | undefined => {
    switch (commandID) {
        case 0x2d:
            if (objectID === 0x2 || objectID === 0x4) {
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
            if (objectID === 0x2 || objectID === 0x3) {
                return {
                    type: "RALLY_POINT_COMMAND",
                    name: "Rally Point",
                    description: "Set a rally point",
                };
            }
            break;
        case 0x2e:
            if (objectID === 0x0) {
                return {
                    type: "HALT_COMMAND",
                    name: "Halt",
                    description: "Ordered a unit to halt",
                };
            }
            break;
        case 0x36:
            if (objectID === 0x2) {
                return {
                    type: "ATTACK_MOVE_COMMAND",
                    name: "Attack Move",
                    description: "Ordered a unit to attack move",
                };
            }
            break;
        case 0x32:
            if (objectID === 0x2 || objectID === 0x4) {
                return {
                    type: "GROUND_ATTACK_COMMAND",
                    name: "Ground Attack",
                    description: "Ordered a unit to ground attack",
                };
            }
            break;
        case 0x3f:
            if (objectID === 0x0) {
                return {
                    type: "RETREAT_COMMAND",
                    name: "Retreat",
                    description: "Ordered a unit to retreat",
                };
            }
            break;
        case 0x3a:
            if (objectID === 0x3) {
                return {
                    type: "GET_IN_STRUCTURE_COMMAND",
                    name: "Get In Structure",
                    description: "Ordered a unit to get in structure",
                };
            }
            break;
        case 0x19:
            if (objectID === 0x0) {
                return {
                    type: "GET_OUT_OF_STRUCTURE_COMMAND",
                    name: "Get Out Of Structure",
                    description: "Ordered a unit to get out of structure",
                };
            }
            break;
        case 0x6a:
            if (objectID === 0x4) {
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
 * Resolves the action subtype / objectID from a command packet.
 *
 * Simple packets store objectID at offset 14 (after a 1-byte entity count and
 * 1-byte payload size at offsets 12-13).
 *
 * Multi-entity packets start at offset 8 with `0x40 | entityCount`, followed by
 * `entityCount` little-endian u32 entity handles. The count/size/objectID
 * triplet then follows; a trailing `0xff` means objectID 0 (halt/retreat).
 */
const extractObjectID = (
    data: Uint8Array,
    commandID: number,
    packetLength: number,
): number => {
    const len = Math.min(data.length, packetLength);
    if (len < 15) return 0;

    let objectOffset = 14;

    if (len > 8 && (data[8] & 0xf0) === 0x40) {
        const entityCount = data[8] & 0x0f;
        const afterEntities = 9 + entityCount * 4;
        if (afterEntities >= len) return 0;
        if (data[afterEntities] === 0xff) return 0;
        // [count][size][objectID:u32]
        objectOffset = afterEntities + 2;
    }

    if (commandID === 0x31) {
        return objectOffset < len ? data[objectOffset]! : 0;
    }

    if (objectOffset + 4 <= len) {
        return (
            data[objectOffset]! |
            (data[objectOffset + 1]! << 8) |
            (data[objectOffset + 2]! << 16) |
            (data[objectOffset + 3]! << 24)
        ) >>> 0;
    }

    return objectOffset < len ? data[objectOffset]! : 0;
};

const isValidCoord = (n: number): boolean => {
    if (!Number.isFinite(n)) return false;
    const abs = Math.abs(n);
    if (abs > 2048) return false;
    if (abs > 0 && abs < 0.01) return false;
    return true;
};

const extractPosition = (
    data: Uint8Array,
    packetLength: number,
): { x: number; y: number; z: number } | undefined => {
    const len = Math.min(data.length, packetLength);
    if (len < 12) return undefined;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const end = len - 12;
    for (let i = 0; i <= end; i++) {
        const x = view.getFloat32(i, true);
        const y = view.getFloat32(i + 4, true);
        const z = view.getFloat32(i + 8, true);
        if (!isValidCoord(x) || !isValidCoord(y) || !isValidCoord(z)) continue;
        if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z) > 0.01) {
            return { x, y, z };
        }
    }
    return undefined;
};

const addAction = (
    replay: ReplayData,
    tick: number,
    timestamp: string,
    data: Uint8Array,
    absoluteOffset: number,
    packetLength: number,
) => {
    const commandID = packetLength >= 3 ? data[2]! : 0;
    const playerID =
        packetLength >= 6 ? data[4]! | (data[5]! << 8) : 0;
    const objectID = extractObjectID(data, commandID, packetLength);

    let command: Action["command"];
    const dynamic = DYNAMIC_BY_COMMAND_ID[commandID];
    if (dynamic) {
        const def = dynamic.def[objectID];
        command = {
            type: dynamic.type,
            name: def?.name || dynamic.fallback,
            description: def?.description || "",
        };
    } else {
        command = resolveStaticCommand(commandID, objectID);
    }

    const position =
        command !== undefined && COMMANDS_WITHOUT_POSITION.has(command.type)
            ? undefined
            : extractPosition(data, packetLength);

    replay.actions.push({
        tick,
        playerID,
        playerName: "",
        timestamp,
        absoluteOffset,
        commandID,
        objectID,
        packetLength,
        command,
        position,
    });
};

const parseMessage = (
    stream: ReplayStream,
    replay: ReplayData,
    tick: number,
): boolean => {
    if (!stream.has(4)) return false;

    const pos = stream.position;
    const length = stream.readUInt32();
    const messageEnd = pos + length + 4;

    // Incomplete message payload
    if (length < 0 || messageEnd > stream.length) {
        return false;
    }

    try {
        if (stream.has(4) && stream.readUInt32() > 0) {
            if (!stream.has(4)) {
                stream.seek(messageEnd);
                return true;
            }
            stream.skip(4);

            if (!stream.has(4)) {
                stream.seek(messageEnd);
                return true;
            }
            const L = stream.readUInt32();
            let playerName = "";
            let playerID = 0;

            if (L > 0) {
                if (!stream.has(L * 2 + 2)) {
                    stream.seek(messageEnd);
                    return true;
                }
                playerName = stream.readUnicodeStr(L);
                playerID = stream.readUInt16();
            } else {
                playerName = "System";
                playerID = 0;
                if (stream.has(2)) stream.skip(2);
            }

            if (!stream.has(10)) {
                stream.seek(messageEnd);
                return true;
            }
            stream.skip(6);
            const recipient = stream.readUInt32();
            const message = stream.readLengthPrefixedUnicodeStr();

            // 8 ticks per second
            const totalSeconds = Math.floor(tick / 8);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const timestamp = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

            replay.messages.push({
                tick,
                sender: playerName,
                playerID: playerID,
                content: message,
                recipient,
                timestamp,
            });
        }
    } catch {
        // Malformed message — jump to declared end when possible
        stream.seek(messageEnd);
        return stream.position < stream.length;
    }

    stream.seek(messageEnd);
    return true;
};

const normalizePlayerName = (name: string): string => name.trim().toLowerCase();

const isPlayerUnassigned = (player: { id?: number }): boolean =>
    player.id === undefined || player.id === 0;

/**
 * Applies Replay Manager `0xBADC0DE` steam IDs + MPN→playerID links when the
 * blob player count matches the header lobby order.
 */
const applyRelicLadderPlayers = (replay: ReplayData): void => {
    const ladder = replay.relicLadderPlayers;
    if (!ladder || ladder.length === 0) return;
    if (ladder.length !== replay.players.length) return;

    const claimedIds = new Set(
        replay.players
            .map((p) => p.id)
            .filter((id): id is number => !!id && id !== 0),
    );

    for (let i = 0; i < replay.players.length; i++) {
        const player = replay.players[i];
        const entry = ladder[i];

        if (
            (player.steamId === undefined || player.steamId.length === 0) &&
            entry.steamId !== "0"
        ) {
            player.steamId = entry.steamId;
        }

        if (!isPlayerUnassigned(player)) continue;
        if (entry.mpn > 7) continue;

        const id = 1000 + entry.mpn;
        if (claimedIds.has(id)) continue;

        player.id = id;
        claimedIds.add(id);
    }
};

/**
 * Links header players to in-game action playerIDs (1000–1007).
 *
 * Evidence from GameReplays/pingtoft (`findPlayerIDs` is chat-only + TODO) and
 * COHRA Helper (`E8` = #1 allied only in *fixed* position games):
 *   - Replay Manager `0xBADC0DE` blob: authoritative name-index → MPN
 *   - Fixed start: engine ID is reliably `1000 + lobby slot`
 *   - Random start: lobby slot ≠ engine ID; chat is the only hard name↔ID link
 *   - Unique faction residuals can fill the last seat on a faction/side
 *
 * Never assign multiple same-faction teammates by sorted-ID ↔ lobby order —
 * that coin-flip swapped Armor/Infantry on random-start 2v2 replays.
 */
const findPlayerIDs = (replay: ReplayData) => {
    // Strategy 0: Replay Manager ladder blob (live-captured MPN + Steam)
    applyRelicLadderPlayers(replay);

    const claimedIds = new Set(
        replay.players
            .map((p) => p.id)
            .filter((id): id is number => !!id && id !== 0),
    );

    // Strategy 1: Chat messages (only hard name ↔ playerID link in the format)
    for (const message of replay.messages) {
        if (!message.sender || message.sender === "System") continue;
        if (!message.playerID || claimedIds.has(message.playerID)) continue;

        const senderKey = normalizePlayerName(message.sender);
        const player = replay.players.find(
            (p) =>
                isPlayerUnassigned(p) &&
                normalizePlayerName(p.name) === senderKey,
        );
        if (!player) continue;

        player.id = message.playerID;
        claimedIds.add(message.playerID);
    }

    // Action-based faction detection for residual / slot validation
    const idFactionMap = new Map<number, string>();

    const US_UNITS = new Set([
        0x30, // Riflemen
        0xa, // Engineers
        0x3d, // Jeep
        0x4b, // M4 Sherman
        0x4f, // M8 Armored Car
        0x3f, // M10
        0x41, // M18 Hellcat
    ]);

    const CW_UNITS = new Set([
        0x7b, // Infantry Section
        0x72, // Lieutenant
        0x85, // Bren Carrier
        0x79, // Sappers
        0x8e, // Cromwell
        0x9a, // Stuart
        0x5c, // Commandos
    ]);

    const WEHR_UNITS = new Set([
        0xbc, // Pioneers
        0xcf, // Volksgrenadiers
        0xa4, // MG42
        0xed, // Motorcycle
        0xe6, // Sdkfz 251
        0xbd, // Sniper (Wehr)
        0xf3, // Panzer IV
        0xf2, // Panther
    ]);

    const PE_UNITS = new Set([
        0x121, // Panzer Grenadiers
        0x141, // Kettenkrad
        0x127, // Scout Car
        0x139, // Hotchkiss
        0x13c, // Marder III
        0x131, // Bergetiger
        0x12a, // Infantry Halftrack
        0x12b, // Mortar Halftrack
    ]);

    for (const action of replay.actions) {
        if (!isUnit(action.commandID)) continue;
        if (US_UNITS.has(action.objectID)) {
            idFactionMap.set(action.playerID, "allies");
        } else if (CW_UNITS.has(action.objectID)) {
            idFactionMap.set(action.playerID, "allies_commonwealth");
        } else if (WEHR_UNITS.has(action.objectID)) {
            idFactionMap.set(action.playerID, "axis");
        } else if (PE_UNITS.has(action.objectID)) {
            idFactionMap.set(action.playerID, "axis_panzer_elite");
        }
    }

    const actionPlayerIDs = Array.from(
        new Set(replay.actions.map((a) => a.playerID)),
    ).sort((a, b) => a - b);

    const assignedIds = new Set(
        replay.players
            .map((p) => p.id)
            .filter((id): id is number => !!id && id !== 0),
    );

    const factionsMatch = (playerFaction: string, id: number): boolean => {
        const inferred = idFactionMap.get(id);
        if (!inferred) return true; // no unit evidence yet — don't block
        return inferred === playerFaction;
    };

    /**
     * COHRA Helper: in fixed-position games, engine IDs follow lobby slots
     * (`1000 + slot`). On random-start we only keep the mapping when every
     * candidate is faction-consistent with the unit stream (otherwise slots
     * were shuffled relative to engine IDs).
     */
    const tryAssignSlotIds = (requireFactionEvidence: boolean): void => {
        const candidates = replay.players
            .filter(isPlayerUnassigned)
            .map((p) => ({ player: p, id: 1000 + p.slot }));

        if (candidates.length === 0) return;

        const available = new Set(
            actionPlayerIDs.filter((id) => !assignedIds.has(id)),
        );

        for (const { player, id } of candidates) {
            if (!available.has(id)) return; // slot scheme doesn't fit this replay
            if (requireFactionEvidence) {
                const inferred = idFactionMap.get(id);
                if (!inferred || inferred !== player.faction) return;
            } else if (!factionsMatch(player.faction, id)) {
                return;
            }
        }

        for (const { player, id } of candidates) {
            player.id = id;
            assignedIds.add(id);
        }
    };

    if (!replay.randomStart) {
        // Fixed start — slot index is the engine player index (COHRA model)
        tryAssignSlotIds(false);
    } else {
        // Random start — only accept slot==id when factions line up for everyone
        tryAssignSlotIds(true);
    }

    const assignUnique = (
        players: typeof replay.players,
        ids: number[],
    ): void => {
        if (players.length !== 1 || ids.length !== 1) return;
        const player = players[0];
        const id = ids[0];
        if (!isPlayerUnassigned(player) || assignedIds.has(id)) return;
        player.id = id;
        assignedIds.add(id);
    };

    // Unique residual per exact faction
    const factions = [
        "allies",
        "allies_commonwealth",
        "axis",
        "axis_panzer_elite",
    ] as const;

    for (const faction of factions) {
        const playersOfFaction = replay.players.filter(
            (p) => isPlayerUnassigned(p) && p.faction === faction,
        );
        const idsOfFaction = actionPlayerIDs.filter(
            (id) =>
                !assignedIds.has(id) && idFactionMap.get(id) === faction,
        );
        assignUnique(playersOfFaction, idsOfFaction);
    }

    // Unique residual on broad Allies vs Axis side
    {
        const unassigned = replay.players.filter(isPlayerUnassigned);
        const remainingIds = actionPlayerIDs.filter((id) => !assignedIds.has(id));

        assignUnique(
            unassigned.filter((p) => p.faction.includes("allies")),
            remainingIds.filter((id) => {
                const f = idFactionMap.get(id);
                return !!f && f.includes("allies");
            }),
        );
        assignUnique(
            unassigned.filter((p) => p.faction.includes("axis")),
            remainingIds.filter((id) => {
                const f = idFactionMap.get(id);
                return !!f && f.includes("axis");
            }),
        );
    }

    updateActionPlayerNames(replay);
};

const updateActionPlayerNames = (replay: ReplayData) => {
    const playerMap = new Map<number, string>();
    for (const p of replay.players) {
        if (p.id !== undefined) {
            playerMap.set(p.id, p.name);
        }
    }

    for (const action of replay.actions) {
        if (playerMap.has(action.playerID)) {
            action.playerName = playerMap.get(action.playerID)!;
        }
    }
};

const refineActionDefinitions = (replay: ReplayData) => {
    // Create a map of PlayerID -> Faction
    const playerFactionMap = new Map<number, string>();
    for (const p of replay.players) {
        if (p.id !== undefined && p.faction) {
            playerFactionMap.set(p.id, p.faction);
        }
    }

    for (const action of replay.actions) {
        // Special Case: Command ID 0x3 is overloaded
        // 1. "Armor Piercing Burst (HMG)" - Allies, Short Packet (approx 19 bytes)
        // 2. "Repair vehicle/structure" - Allies, Long Packet (approx 22 bytes + Target ID)
        // 3. "Repair vehicle/structure" - Panzer Elite (Always)
        if (action.commandID === 0x3 && action.objectID === 3) {
             const faction = playerFactionMap.get(action.playerID);
             
             if (faction === "axis_panzer_elite") {
                // PE is always repair
                 action.command = {
                    type: "UNIT_COMMAND",
                    name: "Repair and Recovery Vehicle",
                    description: "Ordered to repair a vehicle or structure",
                };
             } else if (faction === "allies") {
                 // Check packet length to distinguish
                 // Short packet (19) = HMG Burst
                 // Long packet (22) = Repair
                 if (action.packetLength > 20) {
                     action.command = {
                        type: "UNIT_COMMAND",
                        name: "Repair vehicle/structure",
                        description: "Ordered to repair a vehicle or structure",
                    };
                 } else {
                     // Default is HMG Burst, no change needed (as defined in regular definitions)
                 }
             }
        }

        // Only refine Unit Commands for now
        if (isUnitCommand(action.commandID)) {
            const faction = playerFactionMap.get(action.playerID);
            if (!faction) continue;

            const baseDef = (DEFINITIONS.UNIT_COMMAND as any)[action.objectID];
            if (
                baseDef &&
                baseDef.factionVariants &&
                baseDef.factionVariants[faction]
            ) {
                const variant = baseDef.factionVariants[faction];
                action.command = {
                    type: action.command?.type || "UNIT_COMMAND",
                    name: variant.name,
                    description: variant.description,
                };
            }
        }
    }
};
