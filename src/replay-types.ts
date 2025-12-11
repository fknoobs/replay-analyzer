export interface Player {
    name: string;
    faction: string;
    id?: number;
    doctrine?: number;

    actions: Action[];
    messages: Message[];
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
    // We use Uint8Array instead of Buffer for web compatibility
    data: Uint8Array;
    absoluteOffset: number;
    rawHex: string;
    playerID: number;
    playerName: string;
    timestamp: string;
    commandID: number;
    objectID: number;
    position?: { x: number; y: number; z: number };
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
    gameType: "",
    gameDate: "",
    modName: "",
    mapName: "",
    mapFileName: "",
    mapDescription: "",
    mapWidth: 0,
    mapHeight: 0,
    playerCount: 0,
    matchType: "",
    highResources: false,
    randomStart: false,
    vpCount: 0,
    vpGame: false,
    replayName: "",
    duration: 0,
    durationReadable: "",
    players: [],
    messages: [],
    actions: [],
    headerParsed: false,
});

export const DOCTRINES: { [key: number]: string } = {
    2: "Airborne",
    9: "Armor",
    17: "Infantry",
    186: "Blitzkrieg",
    194: "Defensive",
    265: "Terror",
    295: "Luftwaffe",
    302: "Scorched Earth",
    309: "Tank Destroyer",
    316: "Royal Artillery",
    323: "Royal Commandos",
    330: "Royal Engineers",
};

export const getDoctrineName = (doctrineID: number): string => {
    return DOCTRINES[doctrineID];
};
