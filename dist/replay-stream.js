export class ReplayStream {
    constructor(buffer) {
        this._position = 0;
        if (buffer instanceof Uint8Array) {
            // Copy into a tight buffer so DataView offsets are always relative to
            // the replay bytes (avoids pooled ArrayBuffer / transfer edge cases).
            this.uint8Array =
                buffer.byteOffset === 0 &&
                    buffer.byteLength === buffer.buffer.byteLength
                    ? buffer
                    : buffer.slice();
            this.view = new DataView(this.uint8Array.buffer, this.uint8Array.byteOffset, this.uint8Array.byteLength);
        }
        else {
            this.uint8Array = new Uint8Array(buffer);
            this.view = new DataView(buffer);
        }
        this._length = this.view.byteLength;
        this.textDecoderAscii = new TextDecoder("ascii");
        this.textDecoderUtf16 = new TextDecoder("utf-16le");
    }
    get position() {
        return this._position;
    }
    get length() {
        return this._length;
    }
    remaining() {
        return Math.max(0, this._length - this._position);
    }
    has(byteCount) {
        return this._position >= 0 && this._position + byteCount <= this._length;
    }
    seek(pos) {
        this._position = Math.max(0, Math.min(pos, this._length));
    }
    skip(count) {
        this.seek(this._position + count);
    }
    ensure(byteCount) {
        if (!this.has(byteCount)) {
            throw new RangeError(`Unexpected end of replay data (need ${byteCount} bytes at offset ${this._position}, length ${this._length})`);
        }
    }
    readByte() {
        this.ensure(1);
        const val = this.view.getUint8(this._position);
        this._position += 1;
        return val;
    }
    readBytes(length) {
        if (length < 0) {
            throw new RangeError(`Invalid byte length: ${length}`);
        }
        this.ensure(length);
        const buf = this.uint8Array.subarray(this._position, this._position + length);
        this._position += length;
        return buf;
    }
    readUInt8() {
        this.ensure(1);
        const val = this.view.getUint8(this._position);
        this._position += 1;
        return val;
    }
    readUInt16() {
        this.ensure(2);
        const val = this.view.getUint16(this._position, true); // true for Little Endian
        this._position += 2;
        return val;
    }
    readUInt32() {
        this.ensure(4);
        const val = this.view.getUint32(this._position, true);
        this._position += 4;
        return val;
    }
    readInt32() {
        this.ensure(4);
        const val = this.view.getInt32(this._position, true);
        this._position += 4;
        return val;
    }
    readFloat() {
        this.ensure(4);
        const val = this.view.getFloat32(this._position, true);
        this._position += 4;
        return val;
    }
    // Reads ASCII string with explicit length
    readASCIIStr(length) {
        if (length < 0) {
            throw new RangeError(`Invalid ASCII length: ${length}`);
        }
        this.ensure(length);
        const bytes = this.uint8Array.subarray(this._position, this._position + length);
        const str = this.textDecoderAscii.decode(bytes);
        this._position += length;
        // Remove null terminators if present
        return str.replace(/\0/g, "");
    }
    // Reads length-prefixed ASCII string (uint32 length + string)
    readLengthPrefixedASCIIStr() {
        const length = this.readUInt32();
        if (length > this.remaining()) {
            throw new RangeError(`ASCII string length ${length} exceeds remaining ${this.remaining()} bytes`);
        }
        return this.readASCIIStr(length);
    }
    // Reads Unicode (UTF-16LE) string with explicit length (in characters)
    readUnicodeStr(length) {
        if (length < 0) {
            throw new RangeError(`Invalid Unicode length: ${length}`);
        }
        const byteLength = length * 2;
        this.ensure(byteLength);
        const bytes = this.uint8Array.subarray(this._position, this._position + byteLength);
        const str = this.textDecoderUtf16.decode(bytes);
        this._position += byteLength;
        return str;
    }
    // Reads length-prefixed Unicode string (uint32 length + string)
    readLengthPrefixedUnicodeStr() {
        const length = this.readUInt32();
        if (length * 2 > this.remaining()) {
            throw new RangeError(`Unicode string length ${length} chars exceeds remaining ${this.remaining()} bytes`);
        }
        return this.readUnicodeStr(length);
    }
}
