/**
 * Little-endian binary cursor over CoH1 replay bytes.
 *
 * Used internally by the header / tick parsers and exported for advanced
 * tooling. Views are always bound to a tight {@link Uint8Array}: if the input
 * is a view into a larger / pooled buffer, the constructor copies into a
 * dedicated array so `DataView` offsets stay relative to the replay bytes.
 *
 * Out-of-bounds reads throw {@link RangeError}. High-level parsers
 * (`parseReplay` / `parseHeader`) catch these into `meta.warnings`.
 */
export class BinaryReader {
    private view: DataView;
    private _position = 0;
    private _length: number;
    private bytes: Uint8Array;
    private textDecoderAscii = new TextDecoder("ascii");
    private textDecoderUtf16 = new TextDecoder("utf-16le");

    /**
     * @param buffer - Full replay body or a byte view of it.
     */
    constructor(buffer: ArrayBuffer | Uint8Array) {
        if (buffer instanceof Uint8Array) {
            this.bytes =
                buffer.byteOffset === 0 &&
                buffer.byteLength === buffer.buffer.byteLength
                    ? buffer
                    : buffer.slice();
            this.view = new DataView(
                this.bytes.buffer,
                this.bytes.byteOffset,
                this.bytes.byteLength,
            );
        } else {
            this.bytes = new Uint8Array(buffer);
            this.view = new DataView(buffer);
        }
        this._length = this.view.byteLength;
    }

    /** Current read cursor offset in bytes from the start of the buffer. */
    get position(): number {
        return this._position;
    }

    /** Total buffer length in bytes. */
    get length(): number {
        return this._length;
    }

    /** Underlying bytes (same buffer the view reads). */
    get buffer(): Uint8Array {
        return this.bytes;
    }

    /**
     * Bytes remaining from the current cursor to the end of the buffer.
     * @returns Non-negative remaining byte count.
     */
    remaining(): number {
        return Math.max(0, this._length - this._position);
    }

    /**
     * Returns whether `byteCount` bytes can be read from the current position.
     * @param byteCount - Number of bytes required.
     */
    has(byteCount: number): boolean {
        return this._position >= 0 && this._position + byteCount <= this._length;
    }

    /**
     * Moves the cursor to an absolute offset (clamped to `[0, length]`).
     * @param pos - Absolute byte offset.
     */
    seek(pos: number): void {
        this._position = Math.max(0, Math.min(pos, this._length));
    }

    /**
     * Advances (or rewinds with a negative count) the cursor relative to now.
     * @param count - Byte delta; negative values seek backwards.
     */
    skip(count: number): void {
        this.seek(this._position + count);
    }

    /**
     * Ensures at least `byteCount` bytes remain; throws otherwise.
     * @throws {RangeError} When the buffer would be overrun.
     */
    private ensure(byteCount: number): void {
        if (!this.has(byteCount)) {
            throw new RangeError(
                `Unexpected end of replay data (need ${byteCount} bytes at offset ${this._position}, length ${this._length})`,
            );
        }
    }

    /**
     * Reads one unsigned byte and advances by 1.
     * @throws {RangeError} On EOF.
     */
    readByte(): number {
        this.ensure(1);
        const val = this.view.getUint8(this._position);
        this._position += 1;
        return val;
    }

    /**
     * Returns a subarray view of the next `length` bytes and advances.
     * The returned view shares the underlying buffer (not a copy).
     *
     * @param length - Number of bytes to read.
     * @throws {RangeError} When `length` is negative or past EOF.
     */
    readBytes(length: number): Uint8Array {
        if (length < 0) {
            throw new RangeError(`Invalid byte length: ${length}`);
        }
        this.ensure(length);
        const buf = this.bytes.subarray(
            this._position,
            this._position + length,
        );
        this._position += length;
        return buf;
    }

    /** Alias of {@link readByte}. */
    readUInt8(): number {
        return this.readByte();
    }

    /**
     * Reads a little-endian `u16` and advances by 2.
     * @throws {RangeError} On EOF.
     */
    readUInt16(): number {
        this.ensure(2);
        const val = this.view.getUint16(this._position, true);
        this._position += 2;
        return val;
    }

    /**
     * Reads a little-endian `u32` and advances by 4.
     * @throws {RangeError} On EOF.
     */
    readUInt32(): number {
        this.ensure(4);
        const val = this.view.getUint32(this._position, true);
        this._position += 4;
        return val;
    }

    /**
     * Reads a little-endian `u64` as `bigint` and advances by 8.
     * @throws {RangeError} On EOF.
     */
    readBigUInt64(): bigint {
        this.ensure(8);
        const val = this.view.getBigUint64(this._position, true);
        this._position += 8;
        return val;
    }

    /**
     * Reads a little-endian signed `i32` and advances by 4.
     * @throws {RangeError} On EOF.
     */
    readInt32(): number {
        this.ensure(4);
        const val = this.view.getInt32(this._position, true);
        this._position += 4;
        return val;
    }

    /**
     * Reads a little-endian IEEE-754 `f32` and advances by 4.
     * @throws {RangeError} On EOF.
     */
    readFloat(): number {
        this.ensure(4);
        const val = this.view.getFloat32(this._position, true);
        this._position += 4;
        return val;
    }

    /**
     * Reads a fixed-length ASCII string and strips embedded NULs.
     * @param length - Byte length to consume.
     * @throws {RangeError} When `length` is negative or past EOF.
     */
    readASCIIStr(length: number): string {
        if (length < 0) {
            throw new RangeError(`Invalid ASCII length: ${length}`);
        }
        this.ensure(length);
        const slice = this.bytes.subarray(
            this._position,
            this._position + length,
        );
        const str = this.textDecoderAscii.decode(slice);
        this._position += length;
        return str.replace(/\0/g, "");
    }

    /**
     * Reads a `u32` length prefix followed by that many ASCII bytes.
     * @throws {RangeError} When the declared length exceeds the remaining buffer.
     */
    readLengthPrefixedASCIIStr(): string {
        const length = this.readUInt32();
        if (length > this.remaining()) {
            throw new RangeError(
                `ASCII string length ${length} exceeds remaining ${this.remaining()} bytes`,
            );
        }
        return this.readASCIIStr(length);
    }

    /**
     * Reads a fixed-length UTF-16LE string (`length` is in UTF-16 code units).
     * @param length - Number of UTF-16 code units (not bytes).
     * @throws {RangeError} When `length` is negative or past EOF.
     */
    readUnicodeStr(length: number): string {
        if (length < 0) {
            throw new RangeError(`Invalid Unicode length: ${length}`);
        }
        const byteLength = length * 2;
        this.ensure(byteLength);
        const slice = this.bytes.subarray(
            this._position,
            this._position + byteLength,
        );
        const str = this.textDecoderUtf16.decode(slice);
        this._position += byteLength;
        return str;
    }

    /**
     * Reads a `u32` character-count prefix followed by UTF-16LE payload.
     * @throws {RangeError} When the declared length exceeds the remaining buffer.
     */
    readLengthPrefixedUnicodeStr(): string {
        const length = this.readUInt32();
        if (length * 2 > this.remaining()) {
            throw new RangeError(
                `Unicode string length ${length} chars exceeds remaining ${this.remaining()} bytes`,
            );
        }
        return this.readUnicodeStr(length);
    }
}
