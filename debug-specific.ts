// Debug script for specific replay
import fs from 'fs';
import path from 'path';
import { parseReplay } from './src/replay-parser';
import { DEFINITIONS } from './src/action-definitions';

const file = 'replay_bw80ob1cfz.rec';
const filePath = path.resolve(process.cwd(), file);

if (fs.existsSync(filePath)) {
    console.log(`\n\n=== Analyzing: ${file} ===`);
    const buffer = fs.readFileSync(filePath);
    const replay = parseReplay(buffer);

    console.log("Registered Players (from Header/DATAINFO):");
    replay.players.forEach((p, idx) => {
        console.log(`  Slot[${p.slot}] Name: ${p.name}, Faction: ${p.faction}, Assigned ID: ${p.id}, u1: ${p.dataInfo1}, u2: ${p.dataInfo2}`);
    });

    // Collect units produced by each Player ID (from Action Data)
    const unitsByPlayer = new Map<number, Set<number>>();
    const factionGuesses = new Map<number, Set<string>>();

    // Known unit mapping (copied from previous thought process)
    const US_UNITS = new Set([0x30, 0xa, 0x3d, 0x4b, 0x4f, 0x3f, 0x41]);
    const CW_UNITS = new Set([0x7b, 0x72, 0x85, 0x79, 0x8e, 0x9a, 0x5c]);
    const WEHR_UNITS = new Set([0xbc, 0xcf, 0xa4, 0xed, 0xe6, 0xbd, 0xf3, 0xf2]);
    const PE_UNITS = new Set([0x121, 0x141, 0x127, 0x139, 0x13c, 0x131, 0x12a, 0x12b]);

    const isUnit = (cmd: number) => cmd === 3 || cmd === 96 || cmd === 0x52;

    replay.actions.forEach(action => {
        if (isUnit(action.commandID)) {
            if (!unitsByPlayer.has(action.playerID)) {
                unitsByPlayer.set(action.playerID, new Set());
                factionGuesses.set(action.playerID, new Set());
            }
            unitsByPlayer.get(action.playerID).add(action.objectID);
            
            // Log command ID usage
             // if (!global.cmdUsage) global.cmdUsage = {};
             // ... actually just log it
             // console.log(`Action: PID ${action.playerID} Cmd ${action.commandID} (0x${action.commandID.toString(16)}) Obj ${action.objectID} (0x${action.objectID.toString(16)})`);

            if (US_UNITS.has(action.objectID)) factionGuesses.get(action.playerID).add("allies");
            if (CW_UNITS.has(action.objectID)) factionGuesses.get(action.playerID).add("allies_commonwealth");
            if (WEHR_UNITS.has(action.objectID)) factionGuesses.get(action.playerID).add("axis");
            if (PE_UNITS.has(action.objectID)) factionGuesses.get(action.playerID).add("axis_panzer_elite");
        }
    });

    console.log("\nUnits Produced by Action Player IDs:");
    unitsByPlayer.forEach((units, pid) => {
            const guesses = Array.from(factionGuesses.get(pid) || []);
            const unitNames = Array.from(units).map(u => {
                // Try to resolve name
                const def = DEFINITIONS.UNIT[u as keyof typeof DEFINITIONS.UNIT];
                return def ? def.name : `0x${u.toString(16)}`; 
            });
            console.log(`  PID ${pid}: Faction Guesses: [${guesses.join(', ')}]`);
            console.log(`    Units: ${unitNames.join(', ')}`);
    });

    console.log("\nChat Messages:");
    replay.messages.forEach(m => {
        console.log(`  Sender: ${m.sender} (ID: ${m.playerID}) -> ${m.content}`);
    });

} else {
    console.log("File not found");
}
