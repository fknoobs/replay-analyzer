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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayStream = void 0;
const fs = __importStar(require("fs"));
class ReplayStream {
    constructor(filePath) {
        this._position = 0;
        this.buffer = fs.readFileSync(filePath);
    }
    get position() {
        return this._position;
    }
    get length() {
        return this.buffer.length;
    }
    seek(pos) {
        this._position = pos;
    }
    skip(count) {
        this._position += count;
    }
    readByte() {
        const val = this.buffer.readUInt8(this._position);
        this._position += 1;
        return val;
    }
    readBytes(length) {
        const buf = this.buffer.subarray(this._position, this._position + length);
        this._position += length;
        return buf;
    }
    readUInt16() {
        const val = this.buffer.readUInt16LE(this._position);
        this._position += 2;
        return val;
    }
    readUInt32() {
        const val = this.buffer.readUInt32LE(this._position);
        this._position += 4;
        return val;
    }
    readInt32() {
        const val = this.buffer.readInt32LE(this._position);
        this._position += 4;
        return val;
    }
    readFloat() {
        const val = this.buffer.readFloatLE(this._position);
        this._position += 4;
        return val;
    }
    // Reads ASCII string with explicit length
    readASCIIStr(length) {
        const str = this.buffer.toString('ascii', this._position, this._position + length);
        this._position += length;
        // Remove null terminators if present
        return str.replace(/\0/g, '');
    }
    // Reads length-prefixed ASCII string (uint32 length + string)
    readLengthPrefixedASCIIStr() {
        const length = this.readUInt32();
        return this.readASCIIStr(length);
    }
    // Reads Unicode (UTF-16LE) string with explicit length (in characters)
    readUnicodeStr(length) {
        const byteLength = length * 2;
        const str = this.buffer.toString('utf16le', this._position, this._position + byteLength);
        this._position += byteLength;
        return str;
    }
    // Reads length-prefixed Unicode string (uint32 length + string)
    readLengthPrefixedUnicodeStr() {
        const length = this.readUInt32();
        return this.readUnicodeStr(length);
    }
}
exports.ReplayStream = ReplayStream;
