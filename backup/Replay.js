"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Replay = void 0;
class Replay {
    constructor(actionDefinitions) {
        this.version = 0;
        this.gameType = '';
        this.gameDate = '';
        this.modName = '';
        this.mapName = '';
        this.mapFileName = '';
        this.mapDescription = '';
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.playerCount = 0;
        this.matchType = '';
        this.highResources = false;
        this.randomStart = false;
        this.vpCount = 0;
        this.vpGame = false;
        this.replayName = '';
        this.players = [];
        this.messages = [];
        this.actions = [];
        this.headerParsed = false;
        this.actionDefinitions = null;
        if (actionDefinitions) {
            this.actionDefinitions = actionDefinitions;
        }
    }
    addPlayer(name, faction, id = 0, doctrine = 0) {
        this.players.push({ name, faction, id, doctrine });
        this.playerCount = this.players.length;
    }
    addMessage(tick, sender, senderID, content, recipient) {
        this.messages.push({ tick, sender, senderID, content, recipient });
    }
    addAction(tick, data, absoluteOffset) {
        let playerID = 0;
        let description = "";
        if (data.length > 4) {
            // Player ID is usually at offset 4 (UInt16)
            // But for some short commands it might be different?
            // Based on analysis, Player ID is consistently at offset 4 for the commands we care about.
            if (data.length >= 6) {
                playerID = data.readUInt16LE(4);
            }
            if (this.actionDefinitions) {
                const cmdType = data.readUInt8(2);
                let actionID = 0;
                let categories = [];
                if (cmdType === 0x03) { // Production / Construction
                    if (data.length >= 16) {
                        actionID = data.readUInt16LE(14);
                        categories = ['UNIT', 'BUILDING', 'UPGRADE', 'UNITCOMMAND'];
                    }
                }
                else if (cmdType === 0x2D) { // Ability / Command
                    if (data.length >= 4) {
                        actionID = data.readUInt8(3);
                        categories = ['SPECIALABILITY', 'COMMANDTREE'];
                    }
                }
                else {
                    // Fallback for other types if needed, or try to guess
                    // For now, only handle 0x03 and 0x2D as requested
                    if (data.length > 16) {
                        // Old logic fallback?
                        // actionID = data.readUInt16LE(14);
                    }
                }
                if (categories.length > 0) {
                    description = this.actionDefinitions.getDescription(actionID, categories);
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
        this.actions.push({ tick, data, rawHex, playerID, playerName, timestamp, description, absoluteOffset });
    }
}
exports.Replay = Replay;
