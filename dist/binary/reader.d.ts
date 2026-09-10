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
export declare class BinaryReader {
    private view;
    private _position;
    private _length;
    private bytes;
    private textDecoderAscii;
    private textDecoderUtf16;
    /**
     * @param buffer - Full replay body or a byte view of it.
     */
    constructor(buffer: ArrayBuffer | Uint8Array);
    /** Current read cursor offset in bytes from the start of the buffer. */
    get position(): number;
    /** Total buffer length in bytes. */
    get length(): number;
    /** Underlying bytes (same buffer the view reads). */
    get buffer(): Uint8Array;
    /**
     * Bytes remaining from the current cursor to the end of the buffer.
     * @returns Non-negative remaining byte count.
     */
    remaining(): number;
    /**
     * Returns whether `byteCount` bytes can be read from the current position.
     * @param byteCount - Number of bytes required.
     */
    has(byteCount: number): boolean;
    /**
     * Moves the cursor to an absolute offset (clamped to `[0, length]`).
     * @param pos - Absolute byte offset.
     */
    seek(pos: number): void;
    /**
     * Advances (or rewinds with a negative count) the cursor relative to now.
     * @param count - Byte delta; negative values seek backwards.
     */
    skip(count: number): void;
    /**
     * Ensures at least `byteCount` bytes remain; throws otherwise.
     * @throws {RangeError} When the buffer would be overrun.
     */
    private ensure;
    /**
     * Reads one unsigned byte and advances by 1.
     * @throws {RangeError} On EOF.
     */
    readByte(): number;
    /**
     * Returns a subarray view of the next `length` bytes and advances.
     * The returned view shares the underlying buffer (not a copy).
     *
     * @param length - Number of bytes to read.
     * @throws {RangeError} When `length` is negative or past EOF.
     */
    readBytes(length: number): Uint8Array;
    /** Alias of {@link readByte}. */
    readUInt8(): number;
    /**
     * Reads a little-endian `u16` and advances by 2.
     * @throws {RangeError} On EOF.
     */
    readUInt16(): number;
    /**
     * Reads a little-endian `u32` and advances by 4.
     * @throws {RangeError} On EOF.
     */
    readUInt32(): number;
    /**
     * Reads a little-endian `u64` as `bigint` and advances by 8.
     * @throws {RangeError} On EOF.
     */
    readBigUInt64(): bigint;
    /**
     * Reads a little-endian signed `i32` and advances by 4.
     * @throws {RangeError} On EOF.
     */
    readInt32(): number;
    /**
     * Reads a little-endian IEEE-754 `f32` and advances by 4.
     * @throws {RangeError} On EOF.
     */
    readFloat(): number;
    /**
     * Reads a fixed-length ASCII string and strips embedded NULs.
     * @param length - Byte length to consume.
     * @throws {RangeError} When `length` is negative or past EOF.
     */
    readASCIIStr(length: number): string;
    /**
     * Reads a `u32` length prefix followed by that many ASCII bytes.
     * @throws {RangeError} When the declared length exceeds the remaining buffer.
     */
    readLengthPrefixedASCIIStr(): string;
    /**
     * Reads a fixed-length UTF-16LE string (`length` is in UTF-16 code units).
     * @param length - Number of UTF-16 code units (not bytes).
     * @throws {RangeError} When `length` is negative or past EOF.
     */
    readUnicodeStr(length: number): string;
    /**
     * Reads a `u32` character-count prefix followed by UTF-16LE payload.
     * @throws {RangeError} When the declared length exceeds the remaining buffer.
     */
    readLengthPrefixedUnicodeStr(): string;
}
