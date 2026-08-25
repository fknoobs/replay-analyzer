# Company of Heroes 1 Replay Parser (`@fknoobs/replay-parser`)

A lightweight, type-safe TypeScript parser for Company of Heroes 1 (CoH1) `.rec` files.

Designed to run in modern environments (browser, Tauri, Electron, Node.js) with **no runtime dependencies**. Input is `ArrayBuffer` / `Uint8Array` so file access can stay in the host app (drag-and-drop, Tauri FS, `fs.readFileSync`, etc.).

## Features

- **Header parsing** — game version, map details, mod info, match settings, wall-clock date
- **Players** — names, factions, inferred in-game IDs, doctrines when present
- **Chat log** — messages with timestamps and sender info
- **Action stream** — ticks/commands (orders, construction, abilities), optionally with raw hex
- **Steam ID metadata** — optional name → Steam ID linking, persistable as an `FKSTMETA` trailer on the `.rec`
- **Rename replays** — rewrite the official header `replayName` (visible in CoH) while preserving any `FKSTMETA` trailer
- **No external deps** — does not require `cohra_helper` or external definition files

## Install / build

```bash
pnpm install   # or npm install
pnpm build     # or npm run build
```

Package entry: `dist/index.js` (ESM). Public API is re-exported from `src/index.ts`.

## Basic usage

```typescript
import { readFileSync } from "node:fs";
import { parseReplay, parseHeader } from "@fknoobs/replay-parser";

const bytes = new Uint8Array(readFileSync("./replays/my_replay.rec"));

// Full parse (header + ticks/actions/chat)
const replay = parseReplay(bytes);
// Optional: include raw hex on actions
// const replay = parseReplay(bytes, { includeHexData: true });

console.log(replay.mapName);
console.log(replay.players.map((p) => `${p.name} (${p.faction})`).join(", "));
console.log(replay.durationReadable);

// Header only (faster; no actions/messages)
const header = parseHeader(bytes);
```

In the browser / Tauri, pass a `Uint8Array` from `file.arrayBuffer()` the same way.

## Output (`ReplayData`)

| Field | Notes |
| --- | --- |
| `version`, `gameType` | From the file header |
| `gameDate` | Local wall-clock `YYYY-MM-DDTHH:mm:ss` (no timezone). Covers Gregorian Windows locales worldwide (DMY/MDY/YMD, CJK meridiems, Thai Buddhist years, etc.). Hijri/Persian calendars stay as the raw string; `3/6`+AM/PM can still be US vs AU ambiguous |
| `mapName`, `mapFileName`, `mapDescription`, `mapWidth`, `mapHeight` | Map info |
| `modName`, `matchType`, `replayName` | Match / lobby metadata |
| `highResources`, `randomStart`, `vpCount`, `vpGame` | Match settings |
| `playerCount`, `duration`, `durationReadable` | Summary (`HH:MM:SS`) |
| `players` | See `Player` below |
| `messages` | Chat entries |
| `actions` | Command stream |
| `headerParsed`, `dataParsed`, `errors` | Parse status |

### `Player`

```ts
{
  name: string;
  faction: string;
  id?: number;           // inferred in-game command ID (not Steam / Relic)
  slot: number;
  doctrine?: number;
  doctrineName?: string;
  dataInfo1?: number;    // opaque header ints
  dataInfo2?: number;
  steamId?: string;      // optional; from metadata or applyPlayerSteamIds
}
```

The CoH1 header does **not** contain Steam IDs. Link them by player name (see below).

## Steam ID metadata

### In memory

```typescript
import { parseReplay, applyPlayerSteamIds } from "@fknoobs/replay-parser";

const replay = parseReplay(bytes);
applyPlayerSteamIds(replay, {
  Alice: "76561198000000001",
  Bob: "76561198000000002",
});
// Matching is trim + case-insensitive; mutates replay.players in place
```

### Persist in the `.rec` file

Steam IDs can be stored in an **`FKSTMETA` trailer** appended after the official replay bytes. The game tick stream never sees it: the parser strips the trailer before reading.

```typescript
import {
  embedPlayerSteamIds,
  extractReplayMetadata,
  parseReplay,
} from "@fknoobs/replay-parser";
import { writeFileSync } from "node:fs";

const withIds = embedPlayerSteamIds(bytes, {
  Alice: "76561198000000001",
  Bob: "76561198000000002",
});
writeFileSync("./replays/my_replay.with-steamids.rec", withIds);

// Later: parseReplay / parseHeader auto-apply steamId onto matching players
const replay = parseReplay(withIds);
console.log(replay.players.map((p) => [p.name, p.steamId]));

// Or inspect the trailer without a full parse
const { body, metadata } = extractReplayMetadata(withIds);
```

Re-embedding replaces any existing trailer (it does not stack).

## Rename replay (`replayName`)

`setReplayName` rewrites the length-prefixed UTF-16 `replayName` inside the CoH1 `DATABASE` header chunk (ancestor Relic Chunky lengths are updated). Any existing `FKSTMETA` trailer is preserved.

```typescript
import { parseHeader, setReplayName } from "@fknoobs/replay-parser";
import { writeFileSync } from "node:fs";

const renamed = setReplayName(bytes, "My custom replay title");
writeFileSync("./replays/my_replay.renamed.rec", renamed);

console.log(parseHeader(renamed).replayName);
// → "My custom replay title"
```

## Development

```bash
pnpm dev      # Vite playground (upload .rec, edit name / Steam IDs, download .rec)
pnpm test     # Vitest unit tests
pnpm smoke    # Parse every *.rec in the project root + fixtures/
pnpm build    # tsc → dist/
```

## Credits

Based on research and logic from the Company of Heroes community (GameReplays.org) and original work by Sander Dijkstra. Rewritten and modernized for the current era.
