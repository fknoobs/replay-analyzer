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
    commandID: number;
    objectID: number;
    position?: { x: number, y: number, z: number };
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
        let commandID = 0;
        let objectID = 0;

        // Player ID is consistently at offset 4 (UInt16) for most commands
        if (data.length >= 6) {
            playerID = data.readUInt16LE(4);
        }

        if (data.length >= 3) {
            commandID = data.readUInt8(2);
        }

        if (data.length >= 18) {
            objectID = data.readUInt32LE(14);
        }

        let position: { x: number, y: number, z: number } | undefined;
        
        // Try to find coordinates (3 consecutive floats)
        if (data.length >= 12) {
            for (let i = 0; i <= data.length - 12; i++) {
                const x = data.readFloatLE(i);
                const y = data.readFloatLE(i + 4);
                const z = data.readFloatLE(i + 8);

                const isValid = (n: number) => {
                    if (isNaN(n) || !isFinite(n)) return false;
                    const abs = Math.abs(n);
                    if (abs > 2048) return false;
                    if (abs > 0 && abs < 0.01) return false; 
                    return true;
                };

                if (isValid(x) && isValid(y) && isValid(z)) {
                    if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z) > 0.01) {
                         position = { x, y, z };
                         break;
                    }
                }
            }
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

        this.actions.push({ tick, data, rawHex, playerID, playerName, timestamp, absoluteOffset, commandID, objectID, position });
    }
}
