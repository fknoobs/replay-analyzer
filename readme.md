# Company of Heroes 1 Replay Parser (TypeScript)

A robust, fully functioning replay parser for Company of Heroes 1 (CoH1), written in TypeScript.

This project is a modernization and rewrite of older parsing logic, designed to be lightweight, type-safe, and easily embeddable in modern applications (like Tauri, Electron, or Node.js backends).

## Features

*   **Full Header Parsing**: Extracts game version, map details, mod info, timestamp, and match settings.
*   **Player Info**: Retrieves player names, factions, IDs, and team information.
*   **Chat Log**: Extracts in-game chat messages with timestamps and sender info.
*   **Action Parsing**: Parses the raw command stream (ticks), allowing analysis of player actions (orders, construction, abilities).
*   **Buffer Support**: Can parse replays directly from memory (`Buffer`) or from a file path. This makes it perfect for frontend-heavy apps where file access might be restricted or handled via drag-and-drop.
*   **No External Dependencies**: Does not require `cohra_helper` or external definition files to function.

## Usage

### Installation

```bash
npm install
npm run build
```

### Basic Usage

You can parse a replay by providing a file path or a raw Buffer.

```typescript
import { ReplayParser } from './src/ReplayParser';
import * as fs from 'fs';

// Option 1: Parse from file path
const parser = new ReplayParser('./replays/my_replay.rec');
const replay = parser.parse();

// Option 2: Parse from Buffer (e.g., in a Tauri app)
const buffer = fs.readFileSync('./replays/my_replay.rec');
const parserFromBuffer = new ReplayParser(buffer);
const replayFromBuffer = parserFromBuffer.parse();

console.log(`Map: ${replay.mapName}`);
console.log(`Players: ${replay.players.map(p => p.name).join(', ')}`);
```

## Output Structure

The `parse()` method returns a `Replay` object containing:

*   `version`: Replay version.
*   `gameDate`: Date the match was played.
*   `mapName` / `mapFileName`: Map details.
*   `players`: Array of player objects `{ name, faction, id, ... }`.
*   `messages`: Array of chat messages.
*   `actions`: Array of game actions (ticks), including raw hex data and timestamps.

## Development

To run the included test script against a replay file:

```bash
npm run build
node dist/index.js path/to/replay.rec
```

## Credits

Based on research and logic from the Company of Heroes community (GameReplays.org) and original work by Sander Dijkstra. Rewritten and modernized for the current era.
