/**
 * Relic CoH 2.700+ / Replay Manager may store a `0x0BADC0DE` binary blob after
 * the "matchname" key instead of a plain lobby name (`"automatch"`, …).
 *
 * Layout (minianalyzer.cpp):
 * - `u32` magic `0x0BADC0DE`
 * - `u8` version (=1), `u8` loglevel (1–3), `u8` nplayers
 * - per player: `u64` steamId, `u8` mpn, `u16` rankBefore, `u16` rankAfter,
 *   `u8` level, `u8` result
 */
/** Little-endian magic for Replay Manager ladder blobs (`0x0BADC0DE`). */
export const RELIC_BINARY_BLOB_MAGIC = 0x0badc0de;
/**
 * Attempts to parse a BADCOE ladder payload at the current stream position.
 * Always consumes exactly `payloadLength` bytes (seek-restored on failure paths).
 *
 * @param stream - Reader positioned at the start of the matchname value payload.
 * @param payloadLength - Declared ASCII/blob length from the length prefix.
 * @returns Parsed ladder rows, or `undefined` when magic / version / size fail.
 */
export const readRelicLadderPlayers = (stream, payloadLength) => {
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
        const needed = 3 + nplayers * 15;
        if (needed > payloadLength - 4) {
            return undefined;
        }
        const players = [];
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
    }
    catch {
        return undefined;
    }
    finally {
        stream.seek(payloadStart + payloadLength);
    }
};
/**
 * Reads the lobby / matchname value after the DATABASE `matchname` key.
 *
 * Printable ASCII names become `matchType`. A BADCOE blob yields empty
 * `matchType` plus optional `ladder` rows. Non-printable binary that is not
 * BADCOE is rejected as an empty match type.
 *
 * @param stream - Reader positioned at the length-prefixed matchname value.
 * @returns `{ matchType, ladder? }`.
 * @throws {RangeError} When the declared length exceeds the remaining buffer.
 */
export const readLobbyMatchType = (stream) => {
    const length = stream.readUInt32();
    if (length === 0)
        return { matchType: "" };
    if (length > stream.remaining()) {
        throw new RangeError(`ASCII string length ${length} exceeds remaining ${stream.remaining()} bytes`);
    }
    if (length >= 4) {
        const start = stream.position;
        const magic = stream.readUInt32();
        stream.seek(start);
        if (magic === RELIC_BINARY_BLOB_MAGIC) {
            const ladder = readRelicLadderPlayers(stream, length);
            return { matchType: "", ladder };
        }
    }
    const value = stream.readASCIIStr(length);
    return {
        matchType: /^[\x20-\x7E]*$/.test(value) ? value : "",
    };
};
