"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const ReplayParser_1 = require("./ReplayParser");
const ActionDefinitions_1 = require("./ActionDefinitions");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
    // Try to find cohra.dat in parent directory or current directory
    let cohraPath = path.resolve(__dirname, '../../cohra.dat'); // Assuming dist/src/index.js or dist/index.js
    if (!fs.existsSync(cohraPath)) {
        cohraPath = path.resolve('cohra.dat');
    }
    if (!fs.existsSync(cohraPath)) {
        cohraPath = path.resolve('../cohra.dat');
    }
    let actionDefinitions;
    if (fs.existsSync(cohraPath)) {
        console.log(`Loading action definitions from ${cohraPath}...`);
        actionDefinitions = new ActionDefinitions_1.ActionDefinitions(cohraPath);
    }
    else {
        console.warn("cohra.dat not found. Action descriptions will be missing.");
    }
    console.log(`Parsing ${filePath}...`);
    const parser = new ReplayParser_1.ReplayParser(filePath, actionDefinitions);
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
        var _a;
        const hex = ((_a = a.rawHex.toUpperCase().match(/.{1,2}/g)) === null || _a === void 0 ? void 0 : _a.join(' ')) || '';
        let coordinates;
        // Try to find coordinates (3 consecutive floats)
        // Heuristic: Look for 3 floats where at least one is non-zero and all are within reasonable map bounds
        if (a.data.length >= 12) {
            for (let i = 0; i <= a.data.length - 12; i++) {
                const x = a.data.readFloatLE(i);
                const y = a.data.readFloatLE(i + 4);
                const z = a.data.readFloatLE(i + 8);
                const isValid = (n) => {
                    if (isNaN(n) || !isFinite(n))
                        return false;
                    const abs = Math.abs(n);
                    if (abs > 2048)
                        return false;
                    // Filter out very small numbers that are likely integers interpreted as floats
                    // But allow exactly 0
                    if (abs > 0 && abs < 0.01)
                        return false;
                    return true;
                };
                if (isValid(x) && isValid(y) && isValid(z)) {
                    // Check if at least one is non-zero to avoid 0,0,0 which might be padding
                    // But 0,0,0 is a valid coordinate... 
                    // However, in this context, we want to find the "interesting" coordinates.
                    // Let's require at least one component to be > 0.01 or < -0.01
                    if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01 || Math.abs(z) > 0.01) {
                        coordinates = { x, y, z };
                        // If we find a valid set, should we stop?
                        // The previous false positive was at offset 3.
                        // The real one is at offset 18.
                        // If we stop at offset 3, we miss the real one.
                        // But with the new check, offset 3 should fail because x (3.87e-38) < 0.01.
                        break;
                    }
                }
            }
        }
        return {
            tick: a.tick,
            // data: a.data, // Omitted as requested
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
