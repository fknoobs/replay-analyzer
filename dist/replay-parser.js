import { ReplayStream } from "./replay-stream";
import { createEmptyReplay } from "./replay-types";
/**
 * Parses the entire replay file.
 * @param input The replay file content as ArrayBuffer or Uint8Array.
 * @returns The parsed ReplayData object.
 */
export const parseReplay = (input) => {
    const stream = new ReplayStream(input);
    const replay = createEmptyReplay();
    try {
        parseHeaderInternal(stream, replay);
        parseDataInternal(stream, replay);
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
export const parseHeader = (input) => {
    const stream = new ReplayStream(input);
    const replay = createEmptyReplay();
    try {
        parseHeaderInternal(stream, replay);
    } catch (e) {
        console.error("Error parsing replay header:", e);
    }
    return replay;
};
const parseHeaderInternal = (stream, replay) => {
    replay.version = stream.readUInt32();
    replay.gameType = stream.readASCIIStr(8);
    // Decode date: C# code scans for null terminator in uint16 steps
    const startPos = stream.position;
    let length = 0;
    while (stream.readUInt16() !== 0) {
        length++;
    }
    stream.seek(startPos);
    replay.gameDate = stream.readUnicodeStr(length);
    stream.readUInt16(); // Skip null terminator
    stream.seek(76); // Fixed offset from C# code
    parseChunky(stream, replay);
    parseChunky(stream, replay);
    assignPlayerIDs(replay);
    replay.headerParsed = true;
};
const assignPlayerIDs = (replay) => {
    const playerCount = replay.players.length;
    for (let i = 0; i < playerCount; i++) {
        // Assuming reverse order: First parsed is highest ID
        replay.players[i].id = 1000 + (playerCount - 1 - i);
    }
};
const parseChunky = (stream, replay) => {
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
const parseChunk = (stream, replay) => {
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
const processDataChunk = (stream, replay, type, version) => {
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
        const id = stream.readUInt16();
        stream.skip(6);
        const faction = stream.readLengthPrefixedASCIIStr();
        addPlayer(replay, playerName, faction, id);
    }
};
const addPlayer = (replay, name, faction, id = 0, doctrine = 0) => {
    replay.players.push({ name, faction, id, doctrine });
    replay.playerCount = replay.players.length;
};
const parseDataInternal = (stream, replay) => {
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
const parseTick = (data, tickDataStart, currentTickCount, replay) => {
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
            );
            offset = actionEnd;
        } else {
            offset += 1; // Skip zero byte
        }
    }
};
const parseActionsInBlock = (
    tick,
    data,
    startIndex,
    endIndex,
    tickDataStart,
    replay,
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
        addAction(replay, tick, actionData, tickDataStart + i);
        actionCount++;
        i += actionLength;
    }
};
const addAction = (replay, tick, data, absoluteOffset) => {
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
        objectID = view.getUint32(14, true);
    }
    let position;
    // Try to find coordinates (3 consecutive floats)
    if (data.length >= 12) {
        for (let i = 0; i <= data.length - 12; i++) {
            const x = view.getFloat32(i, true);
            const y = view.getFloat32(i + 4, true);
            const z = view.getFloat32(i + 8, true);
            const isValid = (n) => {
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
    // Convert to hex string manually since Buffer is not available
    const rawHex = Array.from(data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    // 8 ticks per second
    const totalSeconds = Math.floor(tick / 8);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const timestamp = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    const player = replay.players.find((p) => p.id === playerID);
    const playerName = player ? player.name : "";
    replay.actions.push({
        tick,
        data,
        rawHex,
        playerID,
        playerName,
        timestamp,
        absoluteOffset,
        commandID,
        objectID,
        position,
    });
};
const parseMessage = (stream, replay, tick) => {
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
        replay.messages.push({
            tick,
            sender: playerName,
            playerID: playerID,
            content: message,
            recipient,
        });
    }
    stream.seek(pos + length + 4);
};
