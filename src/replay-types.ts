export interface Player {
    name: string;
    faction: string;
    id?: number;
    doctrine?: number;
}

export interface Message {
    tick: number;
    sender: string;
    senderID: number;
    content: string;
    recipient: number;
}

export interface Action {
    tick: number;
    // We use Uint8Array instead of Buffer for web compatibility
    data: Uint8Array;
    absoluteOffset: number;
    rawHex: string;
    playerID: number;
    playerName: string;
    timestamp: string;
    commandID: number;
    objectID: number;
    position?: { x: number, y: number, z: number };
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

export const createEmptyReplay = (): ReplayData => ({
    version: 0,
    gameType: '',
    gameDate: '',
    modName: '',
    mapName: '',
    mapFileName: '',
    mapDescription: '',
    mapWidth: 0,
    mapHeight: 0,
    playerCount: 0,
    matchType: '',
    highResources: false,
    randomStart: false,
    vpCount: 0,
    vpGame: false,
    replayName: '',
    duration: 0,
    durationReadable: '',
    players: [],
    messages: [],
    actions: [],
    headerParsed: false
});
