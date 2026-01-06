import { ReplayStream } from "./replay-stream";
import {
    ReplayData,
    createEmptyReplay,
    Action,
    getDoctrineName,
} from "./replay-types";
import {
    DEFINITIONS,
    isUnit,
    isUnitCommand,
    isBuilding,
    isDoctrinal,
    isUpgrade,
    isSpecialAbility,
    isAttackMoveCommand,
    isCaptureCommand,
    isGroundAttackCommand,
    isHaltCommand,
    isMoveCommand,
    isRallyPointCommand,
    isRetreatCommand,
    isGetInStructure,
    isGetOutOfStructure,
    isAiTakeOver,
} from "./action-definitions";
import { parseDate } from "chrono-node";

export interface ParseOptions {
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
    const stream = new ReplayStream(input);
    const replay = createEmptyReplay();

    try {
        parseHeaderInternal(stream, replay);
        parseDataInternal(stream, replay, options);
        findPlayerIDs(replay);

        replay.players.forEach((player) => {
            player.doctrine =
                replay.actions.find(
                    (action) =>
                        action.commandID === 98 &&
                        action.playerID === player.id,
                )?.objectID || undefined;

            if (player.doctrine !== undefined) {
                player.doctrineName = getDoctrineName(player.doctrine);
            }
        });
    } catch (e) {
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
    const stream = new ReplayStream(input);
    const replay = createEmptyReplay();

    try {
        parseHeaderInternal(stream, replay);
    } catch (e) {
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
    while (stream.readUInt16() !== 0) {
        length++;
    }
    stream.seek(startPos);
    replay.gameDate =
        parseDate(stream.readUnicodeStr(length))?.toISOString() ||
        stream.readUnicodeStr(length);
    stream.readUInt16(); // Skip null terminator

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
    if (version !== 3) return false;

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
        replay.vpCount = 250 * (1 << vpVal);
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
        stream.readLengthPrefixedASCIIStr(); // matchname
        replay.matchType = stream.readLengthPrefixedASCIIStr();
    } else if (type.startsWith("DATAINFO") && version === 6) {
        const playerName = stream.readLengthPrefixedUnicodeStr();
        const u1 = stream.readUInt32();
        const u2 = stream.readUInt32();
        const faction = stream.readLengthPrefixedASCIIStr();

        // u1 is likely the player ID
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
        if (stream.position + 4 > stream.length) break;

        const marker = stream.readUInt32();

        if (marker === 0) {
            // Tick Data
            const tickLength = stream.readUInt32();
            if (tickLength === 0 || tickLength > 10000000) continue; // Safety

            const tickDataStart = stream.position;
            const tickData = stream.readBytes(tickLength);
            parseTick(tickData, tickDataStart, tickCount, replay, options);

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
            parseMessage(stream, replay, tickIndex);
        } else {
            // Old format fallback or unknown, skipping for safety in this port
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
    options?: ParseOptions,
) => {
    if (data.length < 16) return;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let tickId = view.getUint32(0, true);
    if (tickId >= 4000000000) {
        tickId = currentTickCount;
    }
    // Bytes 4-11 are timestamp
    const bundleCount = view.getUint32(12, true);

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
                data,
                offset,
                actionEnd,
                tickDataStart,
                replay,
                options,
            );
            offset = actionEnd;
        } else {
            offset += 1; // Skip zero byte
        }
    }
};

const parseActionsInBlock = (
    tick: number,
    data: Uint8Array,
    startIndex: number,
    endIndex: number,
    tickDataStart: number,
    replay: ReplayData,
    options?: ParseOptions,
) => {
    let i = startIndex;
    const maxActions = 10000;
    let actionCount = 0;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    while (i + 2 <= endIndex && actionCount < maxActions) {
        const actionLength = view.getUint16(i, true);

        if (actionLength <= 0 || actionLength > 1000) break;

        // Capture up to 30 bytes for output matching, even if it overlaps next action
        const captureLength = Math.max(actionLength, 30);
        const safeCaptureLength = Math.min(captureLength, data.length - i);

        const actionData = data.subarray(i, i + safeCaptureLength);
        addAction(replay, tick, actionData, tickDataStart + i, options);
        actionCount++;

        i += actionLength;
    }
};

const DYNAMIC_COMMAND_HANDLERS = [
    {
        check: isUnit,
        type: "UNIT",
        def: DEFINITIONS.UNIT,
        fallback: "Unknown Unit",
    },
    {
        check: isBuilding,
        type: "BUILDING",
        def: DEFINITIONS.BUILDING,
        fallback: "Unknown Building",
    },
    {
        check: isDoctrinal,
        type: "DOCTRINAL",
        def: DEFINITIONS.DOCTRINAL,
        fallback: "Unknown Doctrinal",
    },
    {
        check: isUpgrade,
        type: "UPGRADE",
        def: DEFINITIONS.UPGRADE,
        fallback: "Unknown Upgrade",
    },
    {
        check: isSpecialAbility,
        type: "SPECIAL_ABILITY",
        def: DEFINITIONS.SPECIAL_ABILITY,
        fallback: "Unknown Special Ability",
    },
    {
        check: isUnitCommand,
        type: "UNIT_COMMAND",
        def: DEFINITIONS.UNIT_COMMAND,
        fallback: "Unknown Unit Command",
    },
] as const;

const STATIC_COMMAND_HANDLERS = [
    {
        check: isMoveCommand,
        type: "MOVE_COMMAND",
        name: "Move",
        description: "Ordered a unit to move",
    },
    {
        check: isCaptureCommand,
        type: "CAPTURE_COMMAND",
        name: "Capture",
        description: "Ordered a unit to capture a point",
    },
    {
        check: isRallyPointCommand,
        type: "RALLY_POINT_COMMAND",
        name: "Rally Point",
        description: "Set a rally point",
    },
    {
        check: isHaltCommand,
        type: "HALT_COMMAND",
        name: "Halt",
        description: "Ordered a unit to halt",
    },
    {
        check: isAttackMoveCommand,
        type: "ATTACK_MOVE_COMMAND",
        name: "Attack Move",
        description: "Ordered a unit to attack move",
    },
    {
        check: isGroundAttackCommand,
        type: "GROUND_ATTACK_COMMAND",
        name: "Ground Attack",
        description: "Ordered a unit to ground attack",
    },
    {
        check: isRetreatCommand,
        type: "RETREAT_COMMAND",
        name: "Retreat",
        description: "Ordered a unit to retreat",
    },
    {
        check: isGetInStructure,
        type: "GET_IN_STRUCTURE_COMMAND",
        name: "Get In Structure",
        description: "Ordered a unit to get in structure",
    },
    {
        check: isGetOutOfStructure,
        type: "GET_OUT_OF_STRUCTURE_COMMAND",
        name: "Get Out Of Structure",
        description: "Ordered a unit to get out of structure",
    },
    {
        check: isAiTakeOver,
        type: "AI_TAKEOVER",
        name: "AI Takeover",
        description: "Player has been taken over by AI",
    },
] as const;

const addAction = (
    replay: ReplayData,
    tick: number,
    data: Uint8Array,
    absoluteOffset: number,
    options?: ParseOptions,
) => {
    let playerID = 0;
    let commandID = 0;
    let objectID = 0;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Player ID is consistently at offset 4 (UInt16) for most commands
    if (data.length >= 6) {
        playerID = view.getUint16(4, true);
    }

    if (data.length >= 3) {
        commandID = view.getUint8(2);
    }

    if (data.length >= 18) {
        if (commandID === 0x31) {
            objectID = view.getUint8(14);
        } else {
            objectID = view.getUint32(14, true);
        }
    }

    let position: { x: number; y: number; z: number } | undefined;

    // Try to find coordinates (3 consecutive floats)
    if (data.length >= 12) {
        for (let i = 0; i <= data.length - 12; i++) {
            const x = view.getFloat32(i, true);
            const y = view.getFloat32(i + 4, true);
            const z = view.getFloat32(i + 8, true);

            const isValid = (n: number) => {
                if (isNaN(n) || !isFinite(n)) return false;
                const abs = Math.abs(n);
                if (abs > 2048) return false;
                if (abs > 0 && abs < 0.01) return false;
                return true;
            };

            if (isValid(x) && isValid(y) && isValid(z)) {
                if (
                    Math.abs(x) > 0.01 ||
                    Math.abs(y) > 0.01 ||
                    Math.abs(z) > 0.01
                ) {
                    position = { x, y, z };
                    break;
                }
            }
        }
    }

    // 8 ticks per second
    const totalSeconds = Math.floor(tick / 8);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const timestamp = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    const player = replay.players.find((p) => p.id === playerID);
    const playerName = player ? player.name : "";

    let command: Action["command"];

    const dynamicHandler = DYNAMIC_COMMAND_HANDLERS.find((h) =>
        h.check(commandID),
    );
    if (dynamicHandler) {
        const def = (dynamicHandler.def as any)[objectID];
        command = {
            type: dynamicHandler.type,
            name: def?.name || dynamicHandler.fallback,
            description: def?.description || "",
        };
    } else {
        const staticHandler = STATIC_COMMAND_HANDLERS.find((h) =>
            (h.check as any)(commandID, objectID, data.length),
        );
        if (staticHandler) {
            command = {
                type: staticHandler.type,
                name: staticHandler.name,
                description: staticHandler.description,
            };
        }
    }

    const action: Action = {
        tick,
        playerID,
        playerName,
        timestamp,
        absoluteOffset,
        commandID,
        objectID,
        command,
        position,
    };

    if (options?.includeHexData) {
        // Convert to hex string manually since Buffer is not available
        const rawHex = Array.from(data)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        action.data = data;
        action.rawHex = rawHex;
    }

    replay.actions.push(action);
};

const parseMessage = (
    stream: ReplayStream,
    replay: ReplayData,
    tick: number,
) => {
    const pos = stream.position;
    const length = stream.readUInt32();

    if (stream.readUInt32() > 0) {
        stream.skip(4);

        const L = stream.readUInt32();
        let playerName = "";
        let playerID = 0;

        if (L > 0) {
            playerName = stream.readUnicodeStr(L);
            playerID = stream.readUInt16();
        } else {
            playerName = "System";
            playerID = 0;
            stream.skip(2);
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
    stream.seek(pos + length + 4);
};

const findPlayerIDs = (replay: ReplayData) => {
    // Strategy 1: Use Chat Messages (Most Reliable)
    for (const message of replay.messages) {
        if (message.sender && message.sender !== "System") {
            const player = replay.players.find((p) => p.name === message.sender);
            if (player) {
                player.id = message.playerID;
            }
        }
    }

    // Action-based Faction detection
    const idFactionMap = new Map<number, string>();
    // Key units that definitively identify faction
    const ALLIES_UNITS = new Set([
        0xa, // Engineers
        0x30, // Riflemen
        0x3d, // Jeep
        0x72, // Lieutenant
        0x79, // Sappers
        0x7b, // Infantry Section
        0x85, // Bren Carrier
    ]);
    const AXIS_UNITS = new Set([
        0xbc, // Pioneers
        0xcf, // Volksgrenadiers
        0xed, // Motorcycle
        0x121, // Panzer Grenadiers
        0x127, // Scout Car (PE)
        0xe6, // Sdkfz 251 Halftrack (Wehr)
    ]);

    for (const action of replay.actions) {
        if (isUnit(action.commandID)) {
            if (ALLIES_UNITS.has(action.objectID)) {
                idFactionMap.set(action.playerID, "allies");
            } else if (AXIS_UNITS.has(action.objectID)) {
                idFactionMap.set(action.playerID, "axis");
            }
        }
    }

    // Collect all Action IDs seen
    const actionPlayerIDs = Array.from(
        new Set(replay.actions.map((a) => a.playerID)),
    ).sort((a, b) => a - b);

    const assignedIds = new Set(
        replay.players.map((p) => p.id).filter((id) => id && id !== 0),
    );
    const availableIds = actionPlayerIDs.filter((id) => !assignedIds.has(id));

    // Strategy 2: Match Unassigned Players to Unassigned IDs by Faction
    const unassignedPlayers = replay.players.filter(
        (p) => !p.id || p.id === 0,
    );

    if (unassignedPlayers.length > 0 && availableIds.length > 0) {
        const isAllies = (f: string) => f.includes("allies");
        const isAxis = (f: string) => f.includes("axis");

        const alliesPlayers = unassignedPlayers.filter((p) =>
            isAllies(p.faction),
        );
        const axisPlayers = unassignedPlayers.filter((p) => isAxis(p.faction));

        const alliesIds = availableIds.filter(
            (id) => idFactionMap.get(id) === "allies",
        );
        const axisIds = availableIds.filter(
            (id) => idFactionMap.get(id) === "axis",
        );
        const unknownIds = availableIds.filter((id) => !idFactionMap.has(id));

        // Assign Allies
        // Best effort: assign in order. 
        // Note: Sometimes the list order is reversed vs ID order, but without more info (like slot index), 
        // sequential assignment is the best default.
        if (alliesPlayers.length > 0 && alliesPlayers.length === alliesIds.length) {
            for (let i = 0; i < alliesPlayers.length; i++) {
                alliesPlayers[i].id = alliesIds[i];
                assignedIds.add(alliesIds[i]);
            }
        }

        // Assign Axis
        if (axisPlayers.length > 0 && axisPlayers.length === axisIds.length) {
            for (let i = 0; i < axisPlayers.length; i++) {
                axisPlayers[i].id = axisIds[i];
                assignedIds.add(axisIds[i]);
            }
        }
    }

    // Strategy 3: Fallback - Ensure everyone has an ID
    // Assign any remaining unassigned players to remaining available IDs
    const remainingPlayers = replay.players.filter((p) => !p.id || p.id === 0);
    const finalAvailableIds = actionPlayerIDs.filter(
        (id) => !assignedIds.has(id),
    );

    for (
        let i = 0;
        i < Math.min(remainingPlayers.length, finalAvailableIds.length);
        i++
    ) {
        remainingPlayers[i].id = finalAvailableIds[i];
    }
    
    // Update player names in actions now that we have correct IDs
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
