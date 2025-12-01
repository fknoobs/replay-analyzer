export class ReplayStream {
    private buffer: Buffer;
    private _position: number = 0;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    public get position(): number {
        return this._position;
    }

    public get length(): number {
        return this.buffer.length;
    }

    public seek(pos: number): void {
        this._position = pos;
    }

    public skip(count: number): void {
        this._position += count;
    }

    public readByte(): number {
        const val = this.buffer.readUInt8(this._position);
        this._position += 1;
        return val;
    }

    public readBytes(length: number): Buffer {
        const buf = this.buffer.subarray(this._position, this._position + length);
        this._position += length;
        return buf;
    }

    public readUInt16(): number {
        const val = this.buffer.readUInt16LE(this._position);
        this._position += 2;
        return val;
    }

    public readUInt32(): number {
        const val = this.buffer.readUInt32LE(this._position);
        this._position += 4;
        return val;
    }

    public readInt32(): number {
        const val = this.buffer.readInt32LE(this._position);
        this._position += 4;
        return val;
    }

    public readFloat(): number {
        const val = this.buffer.readFloatLE(this._position);
        this._position += 4;
        return val;
    }

    // Reads ASCII string with explicit length
    public readASCIIStr(length: number): string {
        const str = this.buffer.toString('ascii', this._position, this._position + length);
        this._position += length;
        // Remove null terminators if present
        return str.replace(/\0/g, '');
    }

    // Reads length-prefixed ASCII string (uint32 length + string)
    public readLengthPrefixedASCIIStr(): string {
        const length = this.readUInt32();
        return this.readASCIIStr(length);
    }

    // Reads Unicode (UTF-16LE) string with explicit length (in characters)
    public readUnicodeStr(length: number): string {
        const byteLength = length * 2;
        const str = this.buffer.toString('utf16le', this._position, this._position + byteLength);
        this._position += byteLength;
        return str;
    }

    // Reads length-prefixed Unicode string (uint32 length + string)
    public readLengthPrefixedUnicodeStr(): string {
        const length = this.readUInt32();
        return this.readUnicodeStr(length);
    }
}
