import type { BinaryReader } from "../binary/reader";
import { tryEnterChunky } from "../chunky/walk";
import { parseReplayDate } from "../dates/parse-replay-date";
import type { Player, RelicLadderPlayer, Replay, ReplayHeader } from "../types";
import { readLobbyMatchType } from "./badcoe";

const parseDataChunk = (
    stream: BinaryReader,
    header: ReplayHeader,
    players: Player[],
    state: { ladder?: RelicLadderPlayer[] },
    type: string,
    version: number,
): void => {
    if (type.startsWith("DATASDSC") && version === 0x7d4) {
        stream.skip(4);
        const len = stream.readUInt32();
        stream.skip(12 + 2 * len);

        header.modName = stream.readLengthPrefixedASCIIStr();
        header.mapFileName = stream.readLengthPrefixedASCIIStr();
        stream.skip(20);
        header.mapName = stream.readLengthPrefixedUnicodeStr();
        header.mapDescription = stream.readLengthPrefixedUnicodeStr();
        stream.skip(4);
        header.mapWidth = stream.readUInt32();
        header.mapHeight = stream.readUInt32();
    } else if (type.startsWith("DATABASE") && version === 0xb) {
        stream.skip(8);
        stream.skip(8);
        header.randomStart = stream.readUInt32() === 0;
        stream.skip(4);
        header.highResources = stream.readUInt32() === 1;
        stream.skip(4);
        const vpVal = stream.readUInt32();
        const clampedVp = Math.max(0, Math.min(vpVal, 8));
        header.vpCount = 250 * (1 << clampedVp);
        stream.skip(5);
        header.replayName = stream.readLengthPrefixedUnicodeStr();
        stream.skip(8);
        header.vpGame = stream.readUInt32() === 0x603872a3;
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
        const match = readLobbyMatchType(stream);
        header.matchType = match.matchType;
        if (match.ladder) state.ladder = match.ladder;
    } else if (type.startsWith("DATAINFO") && version === 6) {
        const playerName = stream.readLengthPrefixedUnicodeStr();
        const u1 = stream.readUInt32();
        const u2 = stream.readUInt32();
        const faction = stream.readLengthPrefixedASCIIStr();

        players.push({
            name: playerName,
            faction,
            slot: players.length,
            dataInfo1: u1,
            dataInfo2: u2,
        });
    }
};

const parseChunk = (
    stream: BinaryReader,
    header: ReplayHeader,
    players: Player[],
    state: { ladder?: RelicLadderPlayer[] },
): boolean => {
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

    if (chunkNameLength > 0) {
        stream.readASCIIStr(chunkNameLength);
    }

    const startPosition = stream.position;

    if (chunkType.startsWith("FOLD")) {
        while (stream.position < startPosition + chunkLength) {
            if (!parseChunk(stream, header, players, state)) break;
        }
    } else if (chunkType.startsWith("DATA")) {
        parseDataChunk(stream, header, players, state, chunkType, chunkVersion);
    }

    stream.seek(startPosition + chunkLength);
    return true;
};

const parseChunky = (
    stream: BinaryReader,
    header: ReplayHeader,
    players: Player[],
    state: { ladder?: RelicLadderPlayer[] },
): boolean => {
    if (!tryEnterChunky(stream)) return false;
    while (parseChunk(stream, header, players, state));
    return true;
};

/**
 * Parses the fixed preamble + two Relic Chunky header regions into `replay`.
 *
 * Fills `replay.header`, appends DATAINFO players, and may set `replay.ladder`
 * when a BADCOE blob is present. Leaves the stream positioned at the start of
 * the tick/chat data stream. Sets `replay.meta.headerOk = true` on success.
 *
 * @param stream - Reader over the stripped CoH body (position 0).
 * @param replay - Mutable accumulate target (typically from {@link createEmptyReplay}).
 * @throws {RangeError} On truncated / malformed header data.
 */
export const parseHeaderInto = (
    stream: BinaryReader,
    replay: Replay,
): void => {
    const { header, players } = replay;
    const state: { ladder?: RelicLadderPlayer[] } = {};

    header.version = stream.readUInt32();
    header.gameType = stream.readASCIIStr(8);

    const startPos = stream.position;
    let length = 0;
    while (stream.has(2)) {
        if (stream.readUInt16() === 0) break;
        length++;
        if (length > 256) {
            throw new RangeError("Replay date string exceeds maximum length");
        }
    }
    stream.seek(startPos);
    const dateStr = stream.readUnicodeStr(length);
    header.gameDate = parseReplayDate(dateStr);
    if (stream.has(2)) {
        stream.readUInt16();
    }

    stream.seek(76);

    parseChunky(stream, header, players, state);
    parseChunky(stream, header, players, state);

    if (state.ladder) replay.ladder = state.ladder;
    replay.meta.headerOk = true;
};
