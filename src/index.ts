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

    console.log(`Name: ${replay.replayName}`);
    console.log(`Version: ${replay.version}`);
    console.log(`Game Type: ${replay.gameType}`);
    console.log(`Game Date: ${replay.gameDate}`);
    console.log(`Mod: ${replay.modName}`);
    console.log(`Map: ${replay.mapName}`);
    console.log(`Map File: ${replay.mapFileName}`);
    console.log(`Players: ${replay.playerCount}`);
    console.log(`Duration: (${replay.duration} seconds)`);
    
    replay.players.forEach(p => {
        console.log(`  - ${p.name} (${p.faction})`);
    });

    console.log(`Total Actions: ${replay.actions.length}`);
    console.log(`Total Messages: ${replay.messages.length}`);
};

main();
