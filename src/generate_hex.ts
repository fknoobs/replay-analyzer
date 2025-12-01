import * as fs from 'fs';
import * as path from 'path';
import { ReplayParser } from './ReplayParser';

const replayPath = path.join(__dirname, '../../replays/2Sturzdorf_972025757__[GameReplays.org].rec');

const parser = new ReplayParser(replayPath);
const replay = parser.parse();

const fd = fs.openSync(replayPath, 'r');

for (const action of replay.actions) {
    let buffer = action.data;

    if (buffer.length < 6) continue; 
    
    const playerId = buffer.readUInt16LE(4);
    if (playerId !== 1000) continue;

    // Check if we need to strip
    let strip = false;
    if (buffer.readUInt16LE(0) === 0x0012 && buffer.readUInt16LE(2) === 0x0033) {
        strip = true;
    }

    // Read bytes from file
    // If stripping, we need 27 bytes (to get 25 after stripping 2)
    // If not stripping, we need 25 bytes
    const readLen = strip ? 27 : 25;
    const fileBuffer = Buffer.alloc(readLen);
    fs.readSync(fd, fileBuffer, 0, readLen, action.absoluteOffset);
    
    if (strip) {
        buffer = fileBuffer.subarray(2); // Strip first 2 bytes
    } else {
        buffer = fileBuffer;
    }

    // Pad or truncate to 25 bytes (should be 25 already if we read correctly)
    if (buffer.length > 25) {
        buffer = buffer.subarray(0, 25);
    } else if (buffer.length < 25) {
        const padding = Buffer.alloc(25 - buffer.length, 0);
        buffer = Buffer.concat([buffer, padding]);
    }

    const hex = buffer.toString('hex').toUpperCase();
    console.log(hex.match(/.{1,2}/g)?.join(' '));
}

fs.closeSync(fd);
