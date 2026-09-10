import type { BinaryReader } from "../binary/reader";
import type { Action, ChatMessage, Replay } from "../types";
import { decodeAction } from "../actions/decode";

const parseActionsInBlock = (
    tick: number,
    data: Uint8Array,
    startIndex: number,
    endIndex: number,
    tickDataStart: number,
    enrichCommands: boolean,
    out: Action[],
): void => {
    let i = startIndex;
    let actionCount = 0;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const maxActions = 10000;

    while (
        i + 2 <= endIndex &&
        i + 2 <= data.length &&
        actionCount < maxActions
    ) {
        const actionLength = view.getUint16(i, true);

        if (actionLength <= 0 || actionLength > 1000) break;
        if (i + actionLength > endIndex || i + actionLength > data.length) break;

        out.push(
            decodeAction(
                tick,
                data.subarray(i, i + actionLength),
                tickDataStart + i,
                actionLength,
                enrichCommands,
            ),
        );
        actionCount++;
        i += actionLength;
    }
};

const parseTick = (
    data: Uint8Array,
    tickDataStart: number,
    currentTickCount: number,
    enrichCommands: boolean,
    out: Action[],
): void => {
    if (data.length < 16) return;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let tickId = view.getUint32(0, true);
    if (tickId >= 4000000000) {
        tickId = currentTickCount;
    }
    const bundleCount = view.getUint32(12, true);

    let offset = 16;
    for (let i = 0; i < bundleCount; i++) {
        if (offset + 12 > data.length) break;
        offset += 12;

        if (offset + 4 > data.length) break;

        const actionBlockSize = view.getUint32(offset, true);
        offset += 4;

        if (actionBlockSize > 0 && actionBlockSize < 65536) {
            offset += 1;
            const actionEnd = offset + actionBlockSize;
            if (actionEnd > data.length) break;

            parseActionsInBlock(
                tickId,
                data,
                offset,
                actionEnd,
                tickDataStart,
                enrichCommands,
                out,
            );
            offset = actionEnd;
        } else {
            offset += 1;
        }
    }
};

const parseMessage = (
    stream: BinaryReader,
    tick: number,
    chat: ChatMessage[],
): boolean => {
    if (!stream.has(4)) return false;

    const pos = stream.position;
    const length = stream.readUInt32();
    const messageEnd = pos + length + 4;

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
            let playerId = 0;

            if (L > 0) {
                if (!stream.has(L * 2 + 2)) {
                    stream.seek(messageEnd);
                    return true;
                }
                playerName = stream.readUnicodeStr(L);
                playerId = stream.readUInt16();
            } else {
                playerName = "System";
                playerId = 0;
                if (stream.has(2)) stream.skip(2);
            }

            if (!stream.has(10)) {
                stream.seek(messageEnd);
                return true;
            }
            stream.skip(6);
            const recipient = stream.readUInt32();
            const message = stream.readLengthPrefixedUnicodeStr();

            chat.push({
                tick,
                sender: playerName,
                playerId,
                content: message,
                recipient,
            });
        }
    } catch {
        stream.seek(messageEnd);
        return stream.position < stream.length;
    }

    stream.seek(messageEnd);
    return true;
};

/**
 * Demuxes the post-header tick/chat stream into `replay.actions` / `replay.chat`
 * and sets `durationSeconds` / `meta.dataOk`.
 *
 * Markers: `0` = tick packet, `1` = chat message; other values are skipped
 * (old-format / unknown) without aborting. Truncated tails stop cleanly.
 *
 * @param stream - Reader positioned at the start of the data stream.
 * @param replay - Mutable accumulate target.
 * @param enrichCommands - When true, attach command labels during decode.
 */
export const parseTickStream = (
    stream: BinaryReader,
    replay: Replay,
    enrichCommands: boolean,
): void => {
    let tickIndex = 0;
    let tickCount = 0;

    while (stream.position < stream.length) {
        if (!stream.has(4)) break;

        const marker = stream.readUInt32();

        if (marker === 0) {
            if (!stream.has(4)) break;
            const tickLength = stream.readUInt32();
            if (tickLength === 0 || tickLength > 10000000) continue;
            if (!stream.has(tickLength)) break;

            const tickDataStart = stream.position;
            const tickData = stream.readBytes(tickLength);
            parseTick(
                tickData,
                tickDataStart,
                tickCount,
                enrichCommands,
                replay.actions,
            );

            tickCount++;

            if (tickData.length >= 4) {
                const view = new DataView(
                    tickData.buffer,
                    tickData.byteOffset,
                    tickData.byteLength,
                );
                const newTickIndex = view.getUint32(0, true);
                if (newTickIndex < 4000000000) {
                    tickIndex = newTickIndex;
                }
            }
        } else if (marker === 1) {
            if (!parseMessage(stream, tickIndex, replay.chat)) break;
        } else {
            continue;
        }
    }

    if (tickIndex === 0 && tickCount > 0) {
        replay.durationSeconds = tickCount / 8;
    } else {
        replay.durationSeconds = tickIndex / 8;
    }

    replay.meta.dataOk = true;
};
