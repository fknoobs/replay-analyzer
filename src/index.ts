import { ReplayParser } from './ReplayParser';
import * as fs from 'fs';
import * as path from 'path';

const main = () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log("Usage: node dist/index.js <replay_file>");
        return;
    }

    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    console.log(`Parsing ${filePath}...`);
    // ReplayParser now accepts string path or Buffer. We pass the path.
    const parser = new ReplayParser(filePath);
    const replay = parser.parse();

    console.log(`Version: ${replay.version}`);
    console.log(`Game Type: ${replay.gameType}`);
    console.log(`Game Date: ${replay.gameDate}`);
    console.log(`Mod: ${replay.modName}`);
    console.log(`Map: ${replay.mapName}`);
    console.log(`Map File: ${replay.mapFileName}`);
    console.log(`Players: ${replay.playerCount}`);
    
    replay.players.forEach(p => {
        console.log(`  - ${p.name} (${p.faction})`);
    });

    console.log(`Total Actions: ${replay.actions.length}`);
    console.log(`Total Messages: ${replay.messages.length}`);

    const formattedActions = replay.actions.slice(0, 50).map(a => {
        const hex = a.rawHex.toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
        
        let coordinates: { x: number, y: number, z: number } | undefined;
        
        // Try to find coordinates (3 consecutive floats)
        if (a.data.length >= 12) {
            for (let i = 0; i <= a.data.length - 12; i++) {
                const x = a.data.readFloatLE(i);
                const y = a.data.readFloatLE(i + 4);
                const z = a.data.readFloatLE(i + 8);

                const isValid = (n: number) => {
                    if (isNaN(n) || !isFinite(n)) return false;
                    const abs = Math.abs(n);
                    if (abs > 2048) return false;
                    if (abs > 0 && abs < 0.01) return false; 
                    return true;
                };

                if (isValid(x) && isValid(y) && isValid(z)) {
                    if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z) > 0.01) {
                         coordinates = { x, y, z };
                         break;
                    }
                }
            }
        }

        return {
            tick: a.tick,
            rawHex: hex,
            playerID: a.playerID,
            playerName: a.playerName,
            timestamp: a.timestamp,
            coordinates: coordinates
        };
    });

    console.log(`Actions: ${JSON.stringify(formattedActions, null, 4)}`);
    console.log(`Messages: ${JSON.stringify(replay.messages, null, 4)}`);
};

main();
