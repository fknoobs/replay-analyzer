"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ReplayParser_1 = require("./ReplayParser");
const replayPath = path.join(__dirname, '../../replays/2Sturzdorf_972025757__[GameReplays.org].rec');
const parser = new ReplayParser_1.ReplayParser(replayPath);
const replay = parser.parse();
const fd = fs.openSync(replayPath, 'r');
for (const action of replay.actions) {
    let buffer = action.data;
    if (buffer.length < 6)
        continue;
    const playerId = buffer.readUInt16LE(4);
    if (playerId !== 1000)
        continue;
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
    }
    else {
        buffer = fileBuffer;
    }
    // Pad or truncate to 25 bytes (should be 25 already if we read correctly)
    if (buffer.length > 25) {
        buffer = buffer.subarray(0, 25);
    }
    else if (buffer.length < 25) {
        const padding = Buffer.alloc(25 - buffer.length, 0);
        buffer = Buffer.concat([buffer, padding]);
    }
    const hex = buffer.toString('hex').toUpperCase();
    console.log((_a = hex.match(/.{1,2}/g)) === null || _a === void 0 ? void 0 : _a.join(' '));
}
fs.closeSync(fd);
