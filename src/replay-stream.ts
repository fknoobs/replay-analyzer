export class ReplayStream {
    private view: DataView;
    private _position: number = 0;
    private _length: number;
    private uint8Array: Uint8Array;
    private textDecoderAscii: TextDecoder;
    private textDecoderUtf16: TextDecoder;

    constructor(buffer: ArrayBuffer | Uint8Array) {
        if (buffer instanceof Uint8Array) {
            this.uint8Array = buffer;
            this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } else {
            this.uint8Array = new Uint8Array(buffer);
            this.view = new DataView(buffer);
        }
        this._length = this.view.byteLength;
        this.textDecoderAscii = new TextDecoder('ascii');
        this.textDecoderUtf16 = new TextDecoder('utf-16le');
    }

    public get position(): number {
        return this._position;
    }

    public get length(): number {
        return this._length;
    }

    public seek(pos: number): void {
        this._position = pos;
    }

    public skip(count: number): void {
        this._position += count;
    }

    public readByte(): number {
        const val = this.view.getUint8(this._position);
        this._position += 1;
        return val;
    }

    public readBytes(length: number): Uint8Array {
        const buf = this.uint8Array.subarray(this._position, this._position + length);
        this._position += length;
        return buf;
    }

    public readUInt16(): number {
        const val = this.view.getUint16(this._position, true); // true for Little Endian
        this._position += 2;
        return val;
    }

    public readUInt32(): number {
        const val = this.view.getUint32(this._position, true);
        this._position += 4;
        return val;
    }

    public readInt32(): number {
        const val = this.view.getInt32(this._position, true);
        this._position += 4;
        return val;
    }

    public readFloat(): number {
        const val = this.view.getFloat32(this._position, true);
        this._position += 4;
        return val;
    }

    // Reads ASCII string with explicit length
    public readASCIIStr(length: number): string {
        const bytes = this.uint8Array.subarray(this._position, this._position + length);
        const str = this.textDecoderAscii.decode(bytes);
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
        const bytes = this.uint8Array.subarray(this._position, this._position + byteLength);
        const str = this.textDecoderUtf16.decode(bytes);
        this._position += byteLength;
        return str;
    }

    // Reads length-prefixed Unicode string (uint32 length + string)
    public readLengthPrefixedUnicodeStr(): string {
        const length = this.readUInt32();
        return this.readUnicodeStr(length);
    }
}
