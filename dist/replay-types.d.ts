export interface Player {
    name: string;
    faction: string;
    id?: number;
    doctrine?: number;
}
export interface Message {
    tick: number;
    sender: string;
    playerID: number;
    content: string;
    recipient: number;
}
export interface Action {
    tick: number;
    data: Uint8Array;
    absoluteOffset: number;
    rawHex: string;
    playerID: number;
    playerName: string;
    timestamp: string;
    commandID: number;
    objectID: number;
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
    headerParsed: boolean;
}
export declare const createEmptyReplay: () => ReplayData;
