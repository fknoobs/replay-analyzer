export declare class ReplayStream {
    private view;
    private _position;
    private _length;
    private uint8Array;
    private textDecoderAscii;
    private textDecoderUtf16;
    constructor(buffer: ArrayBuffer | Uint8Array);
    get position(): number;
    get length(): number;
    seek(pos: number): void;
    skip(count: number): void;
    readByte(): number;
    readBytes(length: number): Uint8Array;
    readUInt16(): number;
    readUInt32(): number;
    readInt32(): number;
    readFloat(): number;
    readASCIIStr(length: number): string;
    readLengthPrefixedASCIIStr(): string;
    readUnicodeStr(length: number): string;
    readLengthPrefixedUnicodeStr(): string;
}
