export class ReplayStream {
    constructor(buffer) {
        this._position = 0;
        if (buffer instanceof Uint8Array) {
            this.uint8Array = buffer;
            this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        }
        else {
            this.uint8Array = new Uint8Array(buffer);
            this.view = new DataView(buffer);
        }
        this._length = this.view.byteLength;
        this.textDecoderAscii = new TextDecoder('ascii');
        this.textDecoderUtf16 = new TextDecoder('utf-16le');
    }
    get position() {
        return this._position;
    }
    get length() {
        return this._length;
    }
    seek(pos) {
        this._position = pos;
    }
    skip(count) {
        this._position += count;
    }
    readByte() {
        const val = this.view.getUint8(this._position);
        this._position += 1;
        return val;
    }
    readBytes(length) {
        const buf = this.uint8Array.subarray(this._position, this._position + length);
        this._position += length;
        return buf;
    }
    readUInt8() {
        const val = this.view.getUint8(this._position);
        this._position += 1;
        return val;
    }
    readUInt16() {
        const val = this.view.getUint16(this._position, true); // true for Little Endian
        this._position += 2;
        return val;
    }
    readUInt32() {
        const val = this.view.getUint32(this._position, true);
        this._position += 4;
        return val;
    }
    readInt32() {
        const val = this.view.getInt32(this._position, true);
        this._position += 4;
        return val;
    }
    readFloat() {
        const val = this.view.getFloat32(this._position, true);
        this._position += 4;
        return val;
    }
    // Reads ASCII string with explicit length
    readASCIIStr(length) {
        const bytes = this.uint8Array.subarray(this._position, this._position + length);
        const str = this.textDecoderAscii.decode(bytes);
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
        const bytes = this.uint8Array.subarray(this._position, this._position + byteLength);
        const str = this.textDecoderUtf16.decode(bytes);
        this._position += byteLength;
        return str;
    }
    // Reads length-prefixed Unicode string (uint32 length + string)
    readLengthPrefixedUnicodeStr() {
        const length = this.readUInt32();
        return this.readUnicodeStr(length);
    }
}
