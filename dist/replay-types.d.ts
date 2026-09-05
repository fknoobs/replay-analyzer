export interface Player {
    name: string;
    faction: string;
    id?: number;
    slot: number;
    doctrine?: number;
    doctrineName?: string;
    dataInfo1?: number;
    dataInfo2?: number;
    /** Optional Steam ID, typically applied post-parse via name matching. */
    steamId?: string;
}
/**
 * Per-player ladder fields from a Replay Manager `0xBADC0DE` matchname blob.
 * `mpn` is the in-game map position number; action playerID = `1000 + mpn`.
 */
export interface RelicLadderPlayer {
    steamId: string;
    mpn: number;
    rankingBefore: number;
    rankingAfter: number;
    level: number;
    result: number;
}
export interface Message {
    tick: number;
    sender: string;
    playerID: number;
    content: string;
    recipient: number;
    timestamp: string;
}
export interface Command {
    type: string;
    name: string;
    description: string;
}
export interface Action {
    tick: number;
    absoluteOffset: number;
    playerID: number;
    playerName: string;
    timestamp: string;
    commandID: number;
    objectID: number;
    packetLength: number;
    command?: Command;
    position?: {
        x: number;
        y: number;
        z: number;
    };
}
export interface ReplayData {
    version: number;
    gameType: string;
    gameDate: string;
    modName: string;
    mapName: string;
    mapFileName: string;
    mapDescription: string;
    mapWidth: number;
    mapHeight: number;
    playerCount: number;
    matchType: string;
    highResources: boolean;
    randomStart: boolean;
    vpCount: number;
    vpGame: boolean;
    replayName: string;
    duration: number;
    durationReadable: string;
    players: Player[];
    messages: Message[];
    actions: Action[];
    /**
     * Present when Replay Manager wrote a `0xBADC0DE` blob into the matchname
     * field (live ladder capture). Index aligns with `players` / lobby order.
     */
    relicLadderPlayers?: RelicLadderPlayer[];
    headerParsed: boolean;
    dataParsed: boolean;
    errors: string[];
}
export declare const createEmptyReplay: () => ReplayData;
export declare const DOCTRINES: {
    [key: number]: string;
};
export declare const getDoctrineName: (doctrineID: number) => string | undefined;
