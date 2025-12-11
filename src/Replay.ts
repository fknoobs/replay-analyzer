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
    data: Buffer;
    absoluteOffset: number;
    rawHex: string;
    playerID: number;
    playerName: string;
    timestamp: string;
}

export class Replay {
    public version: number = 0;
    public gameType: string = '';
    public gameDate: string = '';
    public modName: string = '';
    public mapName: string = '';
    public mapFileName: string = '';
    public mapDescription: string = '';
    public mapWidth: number = 0;
    public mapHeight: number = 0;
    public playerCount: number = 0;
    public matchType: string = '';
    public highResources: boolean = false;
    public randomStart: boolean = false;
    public vpCount: number = 0;
    public vpGame: boolean = false;
    public replayName: string = '';
    public duration: number = 0;
    public durationReadable: string = '';
    
    public players: Player[] = [];
    public messages: Message[] = [];
    public actions: Action[] = [];

    public headerParsed: boolean = false;

    constructor() {}

    public addPlayer(name: string, faction: string, id: number = 0, doctrine: number = 0) {
        this.players.push({ name, faction, id, doctrine });
        this.playerCount = this.players.length;
    }

    public addMessage(tick: number, sender: string, senderID: number, content: string, recipient: number) {
        this.messages.push({ tick, sender, senderID, content, recipient });
    }

    public addAction(tick: number, data: Buffer, absoluteOffset: number) {
        let playerID = 0;

        // Player ID is consistently at offset 4 (UInt16) for most commands
        if (data.length >= 6) {
            playerID = data.readUInt16LE(4);
        }

        const rawHex = data.toString('hex');
        
        // 8 ticks per second
        const totalSeconds = Math.floor(tick / 8);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const timestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const player = this.players.find(p => p.id === playerID);
        const playerName = player ? player.name : "";

        this.actions.push({ tick, data, rawHex, playerID, playerName, timestamp, absoluteOffset });
    }
}
