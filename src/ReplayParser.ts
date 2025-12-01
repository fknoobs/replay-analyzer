import * as fs from 'fs';
import { ReplayStream } from './ReplayStream';
import { Replay } from './Replay';

export class ReplayParser {
    private stream: ReplayStream;
    private replay: Replay;

    /**
     * @param input File path (string) or Buffer containing replay data
     */
    constructor(input: string | Buffer) {
        let buffer: Buffer;
        if (typeof input === 'string') {
            buffer = fs.readFileSync(input);
        } else {
            buffer = input;
        }
        
        this.stream = new ReplayStream(buffer);
        this.replay = new Replay();
    }

    public parse(): Replay {
        try {
            this.parseHeader();
            this.parseData();
        } catch (e) {
            console.error("Error parsing replay:", e);
        }
        return this.replay;
    }

    private parseHeader() {
        this.replay.version = this.stream.readUInt32();
        this.replay.gameType = this.stream.readASCIIStr(8);

        // Decode date: C# code scans for null terminator in uint16 steps
        const startPos = this.stream.position;
        let length = 0;
        while (this.stream.readUInt16() !== 0) {
            length++;
        }
        this.stream.seek(startPos);
        this.replay.gameDate = this.stream.readUnicodeStr(length);
        this.stream.readUInt16(); // Skip null terminator

        this.stream.seek(76); // Fixed offset from C# code
        
        this.parseChunky();
        this.parseChunky();
        
        this.assignPlayerIDs();

        this.replay.headerParsed = true;
    }

    private assignPlayerIDs() {
        const playerCount = this.replay.players.length;
        for (let i = 0; i < playerCount; i++) {
            // Assuming reverse order: First parsed is highest ID
            this.replay.players[i].id = 1000 + (playerCount - 1 - i);
        }
    }

    private parseChunky(): boolean {
        const pos = this.stream.position;
        if (pos + 12 > this.stream.length) return false;
        const signature = this.stream.readASCIIStr(12);
        if (signature !== "Relic Chunky") {
            this.stream.seek(pos);
            return false;
        }
        
        this.stream.skip(4);
        const version = this.stream.readUInt32();
        if (version !== 3) return false;
        
        this.stream.skip(4);
        const length = this.stream.readUInt32();
        
        this.stream.skip(length - 28);
        
        while (this.parseChunk());
        
        return true;
    }

    private parseChunk(): boolean {
        if (this.stream.position + 8 > this.stream.length) return false;

        const chunkType = this.stream.readASCIIStr(8);
        
        if (!(chunkType.startsWith("FOLD") || chunkType.startsWith("DATA"))) {
            this.stream.skip(-8);
            return false;
        }

        const chunkVersion = this.stream.readUInt32();
        const chunkLength = this.stream.readUInt32();
        const chunkNameLength = this.stream.readUInt32();
        
        this.stream.skip(8);

        let chunkName = "";
        if (chunkNameLength > 0) {
            chunkName = this.stream.readASCIIStr(chunkNameLength);
        }

        const startPosition = this.stream.position;

        if (chunkType.startsWith("FOLD")) {
            while (this.stream.position < startPosition + chunkLength) {
                if (!this.parseChunk()) break;
            }
        } else if (chunkType.startsWith("DATA")) {
            this.processDataChunk(chunkType, chunkVersion);
        }

        this.stream.seek(startPosition + chunkLength);
        return true;
    }

    private processDataChunk(type: string, version: number) {
        if (type.startsWith("DATASDSC") && version === 0x7d4) {
             this.stream.skip(4);
             const len = this.stream.readUInt32();
             this.stream.skip(12 + 2 * len);
             
             this.replay.modName = this.stream.readLengthPrefixedASCIIStr();
             this.replay.mapFileName = this.stream.readLengthPrefixedASCIIStr();
             this.stream.skip(20);
             this.replay.mapName = this.stream.readLengthPrefixedUnicodeStr();
             this.replay.mapDescription = this.stream.readLengthPrefixedUnicodeStr();
             this.stream.skip(4);
             this.replay.mapWidth = this.stream.readUInt32();
             this.replay.mapHeight = this.stream.readUInt32();
        }
        else if (type.startsWith("DATABASE") && version === 0xb) {
            this.stream.skip(8);
            this.stream.skip(8);
            this.replay.randomStart = (this.stream.readUInt32() === 0);
            this.stream.skip(4);
            this.replay.highResources = (this.stream.readUInt32() === 1);
            this.stream.skip(4);
            const vpVal = this.stream.readUInt32();
            this.replay.vpCount = 250 * (1 << vpVal);
            this.stream.skip(5);
            this.replay.replayName = this.stream.readLengthPrefixedUnicodeStr();
            this.stream.skip(8);
            this.replay.vpGame = (this.stream.readUInt32() === 0x603872a3);
            this.stream.skip(23);
            this.stream.readLengthPrefixedASCIIStr(); // gameminorversion
            this.stream.skip(4);
            this.stream.readLengthPrefixedASCIIStr(); // gamemajorversion
            this.stream.skip(8);
            if (this.stream.readUInt32() === 2) {
                this.stream.readLengthPrefixedASCIIStr(); // gameversion
                this.stream.readLengthPrefixedASCIIStr(); // date
            }
            this.stream.readLengthPrefixedASCIIStr(); // matchname
            this.replay.matchType = this.stream.readLengthPrefixedASCIIStr();
        }
        else if (type.startsWith("DATAINFO") && version === 6) {
            const playerName = this.stream.readLengthPrefixedUnicodeStr();
            const id = this.stream.readUInt16();
            this.stream.skip(6);
            const faction = this.stream.readLengthPrefixedASCIIStr();
            this.replay.addPlayer(playerName, faction, id);
        }
    }

    private parseData() {
        let tickIndex = 0;
        
        while (this.stream.position < this.stream.length) {
            if (this.stream.position + 4 > this.stream.length) break;
            
            const marker = this.stream.readUInt32();

            if (marker === 0) {
                // Tick Data
                const tickLength = this.stream.readUInt32();
                if (tickLength === 0 || tickLength > 10000000) continue; // Safety
                
                const tickDataStart = this.stream.position;
                const tickData = this.stream.readBytes(tickLength);
                this.parseTick(tickData, tickDataStart);
                if (tickData.length >= 4) {
                    tickIndex = tickData.readUInt32LE(0);
                }
            } else if (marker === 1) {
                // Message
                this.parseMessage(tickIndex);
            } else {
                // Old format fallback or unknown, skipping for safety in this port
            }
        }

        this.replay.duration = tickIndex / 8;
    }

    private parseTick(data: Buffer, tickDataStart: number) {
        if (data.length < 16) return;

        const tickId = data.readUInt32LE(0);
        // Bytes 4-11 are timestamp
        const bundleCount = data.readUInt32LE(12);
        
        let offset = 16;
        for (let i = 0; i < bundleCount; i++) {
            if (offset + 12 > data.length) break;
            
            // Skip bundle header (12 bytes)
            offset += 12;

            if (offset + 4 > data.length) break;

            const actionBlockSize = data.readUInt32LE(offset);
            offset += 4;
            
            if (actionBlockSize > 0 && actionBlockSize < 65536) {
                offset += 1; // Skip duplicate byte
                
                const actionEnd = offset + actionBlockSize;
                if (actionEnd > data.length) break;

                this.parseActionsInBlock(tickId, data, offset, actionEnd, tickDataStart);
                offset = actionEnd;
            } else {
                offset += 1; // Skip zero byte
            }
        }
    }

    private parseActionsInBlock(tick: number, data: Buffer, startIndex: number, endIndex: number, tickDataStart: number) {
        let i = startIndex;
        const maxActions = 10000;
        let actionCount = 0;

        while (i + 2 <= endIndex && actionCount < maxActions) {
            const actionLength = data.readUInt16LE(i);
            
            if (actionLength <= 0 || actionLength > 1000) break;

            // Capture up to 30 bytes for output matching, even if it overlaps next action
            const captureLength = Math.max(actionLength, 30);
            const safeCaptureLength = Math.min(captureLength, data.length - i);

            const actionData = data.subarray(i, i + safeCaptureLength);
            this.replay.addAction(tick, actionData, tickDataStart + i);
            actionCount++;

            i += actionLength;
        }
    }

    private parseMessage(tick: number) {
        const pos = this.stream.position;
        const length = this.stream.readUInt32();

        if (this.stream.readUInt32() > 0) {
            this.stream.skip(4);
            
            const L = this.stream.readUInt32();
            let playerName = "";
            let playerID = 0;

            if (L > 0) {
                playerName = this.stream.readUnicodeStr(L);
                playerID = this.stream.readUInt16();
            } else {
                playerName = "System";
                playerID = 0;
                this.stream.skip(2);
            }

            this.stream.skip(6);
            const recipient = this.stream.readUInt32();
            const message = this.stream.readLengthPrefixedUnicodeStr();

            this.replay.addMessage(tick, playerName, playerID, message, recipient);
        }
        this.stream.seek(pos + length + 4);
    }
}
