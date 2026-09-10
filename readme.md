# Company of Heroes 1 Replay Parser (`@fknoobs/replay-parser`) v2

A lightweight, type-safe TypeScript library for reading and lightly editing Company of Heroes 1 (CoH1) `.rec` files.

- **No runtime dependencies** — works in Node.js, browsers, Tauri, Electron
- **Input is bytes** — pass `ArrayBuffer` / `Uint8Array`; file I/O stays in the host app
- **Soft-fail parsing** — never throws to callers; issues land in `replay.meta.warnings`
- **Optional FKSTMETA trailer** — store Steam IDs / player-ID overrides without breaking CoH playback of the body

Package version: **2.0.0** (breaking rewrite of the v1 flat `ReplayData` API).

---

## Table of contents

1. [Install & build](#install--build)
2. [Quick start](#quick-start)
3. [Parse options](#parse-options)
4. [Data model](#data-model)
5. [Parsing pipeline](#parsing-pipeline)
6. [Player ID linking](#player-id-linking)
7. [CPM (commands per minute)](#cpm-commands-per-minute)
8. [FKSTMETA metadata trailer](#fkstmeta-metadata-trailer)
9. [Rename replay](#rename-replay)
10. [Local map archive paths](#local-map-archive-paths)
11. [Dates](#dates)
12. [BinaryReader](#binaryreader)
13. [API reference](#api-reference)
14. [Migrating from v1](#migrating-from-v1)
15. [Development](#development)
16. [Credits](#credits)

---

## Install & build

```bash
pnpm install   # or npm install
pnpm build     # tsc → dist/
```

| Field | Value |
| --- | --- |
| Entry | `dist/index.js` (ESM) |
| Types | `dist/index.d.ts` |
| Exports | `"."` → types + import |

```ts
import {
  parseReplay,
  parseHeader,
  formatDuration,
  playerCpm,
  // …
} from "@fknoobs/replay-parser";
```

---

## Quick start

```typescript
import { readFileSync } from "node:fs";
import {
  formatDuration,
  formatTickTimestamp,
  parseHeader,
  parseReplay,
  playerCpm,
  playerNameById,
} from "@fknoobs/replay-parser";

const bytes = new Uint8Array(readFileSync("./replays/my_replay.rec"));

// Full parse: header + chat + actions + player-ID linking
const replay = parseReplay(bytes);

console.log(replay.header.mapName);
console.log(replay.header.replayName);
console.log(formatDuration(replay.durationSeconds));

for (const p of replay.players) {
  console.log(
    p.name,
    p.faction,
    p.id,
    p.doctrineName,
    playerCpm(replay, p.id),
  );
}

for (const msg of replay.chat.slice(0, 5)) {
  console.log(
    formatTickTimestamp(msg.tick),
    msg.sender,
    msg.content,
  );
}

// Resolve a display name for an action without storing it on every Action
const a = replay.actions[0];
if (a) {
  console.log(playerNameById(replay.players, a.playerId), a.command?.name);
}

// Header only — skips the tick/action stream (much faster for lobby metadata)
const headerOnly = parseHeader(bytes);
console.log(headerOnly.meta.headerOk, headerOnly.players.length);
```

In the browser / Tauri, pass `new Uint8Array(await file.arrayBuffer())` the same way.

---

## Parse options

```ts
type ParseOptions = {
  /** Parse tick / action / chat stream. Default: `true` for `parseReplay`. */
  actions?: boolean;
  /**
   * Attach `action.command` labels (type / name / description) from the
   * built-in definition tables. Default: `true`.
   * Set `false` for a cheaper parse when you only need raw IDs + positions.
   */
  enrichCommands?: boolean;
};
```

```typescript
// Skip command name tables (still decodes packets + positions)
parseReplay(bytes, { enrichCommands: false });

// Header fields + players from DATAINFO, but no ticks/chat/actions
parseReplay(bytes, { actions: false });

// Dedicated header path (same as actions: false for the stream, plus no tick demux)
parseHeader(bytes);
```

Errors during parse are caught and pushed to `replay.meta.warnings`. The library does **not** call `console.error`.

---

## Data model

### `Replay`

```ts
type Replay = {
  header: ReplayHeader;
  players: Player[];
  chat: ChatMessage[];
  actions: Action[];
  /** Present when a Replay Manager `0xBADC0DE` blob was in the matchname field. */
  ladder?: RelicLadderPlayer[];
  /** Match length in seconds (engine ticks ÷ 8). */
  durationSeconds: number;
  meta: ReplayMeta;
};
```

### `ReplayHeader`

| Field | Meaning |
| --- | --- |
| `version` | Replay format version (`u32`) |
| `gameType` | 8-byte ASCII game type |
| `gameDate` | Local wall-clock `YYYY-MM-DDTHH:mm:ss` (no `Z`) |
| `modName` | Mod folder / name from DATASDSC |
| `mapName` / `mapFileName` / `mapDescription` | Map display + file identity |
| `mapWidth` / `mapHeight` | Map size |
| `matchType` | Lobby match name (`"automatch"`, …). Empty when a BADCOE blob replaced it |
| `highResources` | High resources setting |
| `randomStart` | Random start positions |
| `vpCount` | Victory point total (derived from encoded VP index) |
| `vpGame` | VP-game flag |
| `replayName` | Official name shown in CoH / Replay Manager |

### `Player`

| Field | Meaning |
| --- | --- |
| `name` | Lobby / DATAINFO name |
| `faction` | e.g. `allies`, `axis`, `allies_commonwealth`, `axis_panzer_elite` |
| `id?` | In-game action player ID (`1000`–`1007`) when linked |
| `slot` | Lobby order index (0-based) |
| `doctrine?` / `doctrineName?` | From doctrinal actions when `id` is known |
| `dataInfo1?` | ≈ host seat marker (not the action ID) |
| `dataInfo2?` | Team side in observed replays |
| `steamId?` | From BADCOE blob and/or FKSTMETA / `applyPlayerSteamIds` |

### `Action` (lean)

Actions no longer store per-packet `playerName` or `timestamp` strings (v1 did). Use helpers instead.

| Field | Meaning |
| --- | --- |
| `tick` | Engine tick (8 Hz) |
| `playerId` | Issuing player (`1000`–`1007`) |
| `commandId` / `objectId` | Packet command + subtype |
| `offset` | Absolute byte offset in the stripped replay body |
| `packetLength` | Raw packet size |
| `position?` | `{ x, y, z }` when the command family carries coords |
| `command?` | `{ type, name, description }` when `enrichCommands` is on |

Helpers:

- `formatTickTimestamp(tick)` → `"HH:MM:SS"`
- `formatDuration(seconds)` → `"HH:MM:SS"`
- `playerNameById(players, playerId)` → name or `undefined`

### `ChatMessage`

| Field | Meaning |
| --- | --- |
| `tick` | Tick when the message was recorded |
| `sender` | Player name or `"System"` |
| `playerId` | Sender’s action ID (0 for system) |
| `content` | Message text |
| `recipient` | Recipient / channel code |

### `ReplayMeta`

| Field | Meaning |
| --- | --- |
| `headerOk` | Fixed header + Relic Chunky regions parsed |
| `dataOk` | Tick/chat stream demux completed |
| `warnings` | Soft-fail messages (truncated files, unexpected layout, …) |

### Doctrines

```ts
import { DOCTRINES, getDoctrineName } from "@fknoobs/replay-parser";

getDoctrineName(9); // "Armor"
```

---

## Parsing pipeline

```
input bytes
  → strip FKSTMETA trailer (if present)
  → BinaryReader over CoH body
  → fixed preamble (version, gameType, date) + seek(76)
  → Relic Chunky × 2
       DATASDSC → map / mod
       DATABASE → settings, replayName, matchType | BADCOE ladder
       DATAINFO → players
  → [parseReplay] tick/chat demux → Action[] / ChatMessage[]
  → player-ID linking + doctrine attach
  → optional command refine (faction variants)
  → apply FKSTMETA steamIds / playerIds
```

Duration: last meaningful tick index ÷ 8 seconds (fallback: tick-packet count ÷ 8).

---

## Player ID linking

DATAINFO has names/factions but **not** the action-stream player ID. The parser links conservatively:

1. **BADCOE ladder blob** (`0x0BADC0DE`) — lobby index → `mpn` → `id = 1000 + mpn`, plus Steam IDs
2. **Chat** — sender name ↔ `playerId`
3. **Fixed start** — `id = 1000 + lobby slot` when the slot scheme fits
4. **Unique faction residual** — exactly one unassigned player and one unclaimed ID for that faction/side

It does **not** assign same-faction teammates by sorted lobby order on random start (that historically swapped Armor/Infantry doctrines).

### Inspect ambiguity

```typescript
import { getUnresolvedPlayerIds, applyPlayerIds, embedPlayerIds } from "@fknoobs/replay-parser";

const unresolved = getUnresolvedPlayerIds(replay);
// unresolved.unassignedPlayers — header players still without id
// unresolved.unclaimedIds — leftover 1000–1007 IDs with faction/doctrine hints

applyPlayerIds(replay, {
  "EGY | GAZA": 1003,
  CamoFILMs: 1002,
});

const persisted = embedPlayerIds(bytes, {
  "EGY | GAZA": 1003,
  CamoFILMs: 1002,
});
```

Matching for `applyPlayerIds` / `applyPlayerSteamIds` is **trim + case-insensitive**.

---

## CPM (commands per minute)

Aligned with Replay Manager’s `C2A.EXE` backend:

```typescript
import { playerCpm, playerCpmLabel, countCpmCommands } from "@fknoobs/replay-parser";

playerCpm(replay, player.id);       // number, rounded
playerCpmLabel(replay, player.id);  // "99"
```

Rules:

- Count unique `(tick, commandId, objectId)` among eligible actions (collapses multi-entity spam on one tick)
- Stop at the first `AI_TAKEOVER` for that player; divisor is minutes until that tick (else full `durationSeconds`)
- Exclude aura / non-input `UNIT_COMMAND`s (`Maintain Command Range`, `Set Up Truck`, …) — see `CPM_EXCLUDED_UNIT_COMMAND_IDS`
- The takeover packet itself does **not** count (early dropout → CPM `0`)

Lower-level helpers: `isAiTakeoverAction`, `isCpmExcludedAction`, `actionsUntilAiTakeover`, `cpmEligibleActions`, `cpmDurationMinutes`.

AI takeover is detected via `command.type === "AI_TAKEOVER"` **or** raw `commandId === 0x6a && objectId === 0x4` (works even with `enrichCommands: false`).

---

## FKSTMETA metadata trailer

Optional trailer **after** the official CoH1 body. The game never sees it: parsers strip it first.

```
[CoH replay body]
[JSON UTF-8 payload]
[u32 LE jsonByteLength]
[u32 LE version = 1]
[8 ASCII "FKSTMETA"]
```

Payload shape:

```ts
type ReplayMetadata = {
  steamIdsByName: Record<string, string>;
  playerIdsByName: Record<string, number>;
};
```

| Function | Behavior |
| --- | --- |
| `extractReplayMetadata(input)` | `{ body, metadata }` — body is CoH-readable |
| `hasReplayMetadata(input)` | Valid trailer with parseable JSON |
| `hasReplayMetadataTrailer(input)` | Valid framing (even if JSON is corrupt) |
| `stripReplayMetadata(input)` | Body only (may be a view) |
| `resetReplayMetadata(input)` | Detached copy of body (does **not** undo `setReplayName`) |
| `embedReplayMetadata(input, meta)` | Replace trailer; returns new buffer |
| `embedPlayerSteamIds` / `embedPlayerIds` | Patch one map; preserve the other |

```typescript
import {
  embedPlayerSteamIds,
  embedPlayerIds,
  extractReplayMetadata,
  parseReplay,
  resetReplayMetadata,
} from "@fknoobs/replay-parser";
import { writeFileSync } from "node:fs";

let withMeta = embedPlayerSteamIds(bytes, {
  Alice: "76561198000000001",
  Bob: "76561198000000002",
});
withMeta = embedPlayerIds(withMeta, { Alice: 1000, Bob: 1001 });
writeFileSync("./out.with-meta.rec", withMeta);

const replay = parseReplay(withMeta); // auto-applies trailer maps
const { body, metadata } = extractReplayMetadata(withMeta);

// CoH / Replay Manager export (trailer removed)
writeFileSync("./out.reset.rec", resetReplayMetadata(withMeta));
```

**Important:** CoH and Replay Manager cannot read files that still have an FKSTMETA trailer. Use `resetReplayMetadata` or `prepareForLocalCoh` before handing bytes to the game.

---

## Rename replay

`setReplayName` rewrites the length-prefixed UTF-16LE `replayName` inside the `DATABASE` header chunk and updates ancestor Relic Chunky length fields. Any existing FKSTMETA trailer is preserved.

```typescript
import { parseHeader, setReplayName } from "@fknoobs/replay-parser";
import { writeFileSync } from "node:fs";

const renamed = setReplayName(bytes, "My custom replay title");
writeFileSync("./out.renamed.rec", renamed);
console.log(parseHeader(renamed).header.replayName);
```

Throws if the DATABASE chunk / string cannot be located (corrupt or unsupported header).

---

## Local map archive paths

Workshop / custom maps often embed an absolute Windows `.sga` / `.sgb` path under `\My Games\Company of Heroes…` inside DATASDSC. Replays recorded on another PC fail to find the archive locally.

| Function | Behavior |
| --- | --- |
| `defaultLocalDocumentsRoot()` | `%USERPROFILE%\Documents` / `$HOME/Documents`, or `undefined` in browsers |
| `toLocalMapArchivePath(foreign, docs)` | Rewrite keeping the `\My Games\…` suffix |
| `findMapArchivePaths(input)` | List embedded absolute archive paths |
| `rewriteLocalMapArchivePaths(input, opts)` | Rewrite in place; preserve FKSTMETA |
| `prepareForLocalCoh(input, opts)` | Strip FKSTMETA **and** rewrite paths |

```typescript
import { prepareForLocalCoh, findMapArchivePaths } from "@fknoobs/replay-parser";

console.log(findMapArchivePaths(bytes));

const { bytes: localReady, rewritten } = prepareForLocalCoh(bytes, {
  localDocuments: "C:\\Users\\You\\Documents",
});
// Hand `localReady` to CoH / Replay Manager
```

---

## Dates

Replay headers store the recorder’s Windows short date + time (`g`), which varies by culture.

`parseReplayDate(raw)` returns timezone-naive `YYYY-MM-DDTHH:mm:ss` for Gregorian Windows locales (DMY/MDY/YMD, CJK meridiems, Thai Buddhist years, …). Hijri/Persian calendars fall back to the raw string. Ambiguous `3/6` + AM/PM can still be US vs AU.

Used automatically during header parse; export it if you need to normalize dates yourself.

---

## BinaryReader

Low-level little-endian reader used internally and exported for advanced tooling:

```typescript
import { BinaryReader } from "@fknoobs/replay-parser";

const r = new BinaryReader(bytes);
r.readUInt32();
r.readLengthPrefixedUnicodeStr();
```

Views are bound to a tight `Uint8Array` (views into pooled buffers are copied). Out-of-bounds reads throw `RangeError` — the high-level parsers catch these into `meta.warnings`.

---

## API reference

### Parsing

| Export | Description |
| --- | --- |
| `parseReplay(input, options?)` | Full parse → `Replay` |
| `parseHeader(input)` | Header (+ BADCOE / FKSTMETA) only |
| `ParseOptions` | `actions?`, `enrichCommands?` |

### Types & helpers

| Export | Description |
| --- | --- |
| `Replay`, `ReplayHeader`, `ReplayMeta`, `Player`, `Action`, `ChatMessage`, `Command`, `Vec3`, `RelicLadderPlayer` | Public model |
| `createEmptyReplay` / `createEmptyHeader` | Empty shells for tests / manual builds |
| `DOCTRINES` / `getDoctrineName` | Doctrine ID → name |
| `formatDuration` / `formatTickTimestamp` / `playerNameById` | Display helpers |
| `BinaryReader` | LE binary cursor |
| `parseReplayDate` | Locale date string → ISO local |

### Players

| Export | Description |
| --- | --- |
| `applyPlayerIds` | Name → action ID overrides (mutates replay) |
| `applyPlayerSteamIds` | Name → Steam ID (mutates replay) |
| `getUnresolvedPlayerIds` | Ambiguous leftover players / IDs |
| `UnclaimedPlayerId`, `UnresolvedPlayerIds` | Ambiguity result types |

### Analytics

| Export | Description |
| --- | --- |
| `playerCpm` / `playerCpmLabel` | C2A-aligned CPM |
| `countCpmCommands`, `cpmEligibleActions`, `actionsUntilAiTakeover`, `cpmDurationMinutes` | Building blocks |
| `isAiTakeoverAction`, `isCpmExcludedAction` | Filters |
| `CPM_EXCLUDED_UNIT_COMMAND_IDS` | Aura / spam object IDs |
| `CpmAction` | Minimal action shape for CPM helpers |

### Metadata

| Export | Description |
| --- | --- |
| `extractReplayMetadata`, `embedReplayMetadata` | Read / write trailer |
| `embedPlayerSteamIds`, `embedPlayerIds` | Partial trailer updates |
| `stripReplayMetadata`, `resetReplayMetadata` | Remove trailer |
| `hasReplayMetadata`, `hasReplayMetadataTrailer` | Presence checks |
| `ReplayMetadata`, `ExtractedReplay` | Trailer types |

### Mutators

| Export | Description |
| --- | --- |
| `setReplayName` | Rewrite official `replayName` |
| `findMapArchivePaths` | List embedded `.sga` / `.sgb` paths |
| `rewriteLocalMapArchivePaths` | Rewrite paths; keep trailer |
| `prepareForLocalCoh` | Strip trailer + rewrite paths |
| `toLocalMapArchivePath`, `defaultLocalDocumentsRoot` | Path helpers |
| `RewriteLocalMapPathOptions` / `Result`, `PrepareForLocalCoh*` | Option/result types |

---

## Migrating from v1

| v1 | v2 |
| --- | --- |
| Flat `ReplayData` fields (`mapName`, `matchType`, …) | Nested `replay.header.*` |
| `duration` / `durationReadable` | `durationSeconds` + `formatDuration()` |
| `messages` | `chat` |
| `errors` / `headerParsed` / `dataParsed` | `meta.warnings` / `meta.headerOk` / `meta.dataOk` |
| `action.playerID` / `commandID` / `objectID` | `playerId` / `commandId` / `objectId` |
| `action.absoluteOffset` | `action.offset` |
| `action.playerName` / `timestamp` | `playerNameById` / `formatTickTimestamp` |
| `relicLadderPlayers` | `ladder` |
| `playerCount` | `players.length` |
| `includeHexData` | Removed; use `actions` / `enrichCommands` |
| `ReplayStream` | `BinaryReader` |
| Soft-fail + `console.error` | Soft-fail only (`meta.warnings`) |

There is **no** compatibility shim. Bump consumers to `@fknoobs/replay-parser@2`.

---

## Development

```bash
pnpm dev      # Vite playground (upload .rec, edit name / Steam / IDs, download)
pnpm test     # Vitest unit tests
pnpm smoke    # Parse every *.rec in project root + fixtures/
pnpm build    # tsc → dist/
```

Source layout:

```
src/
  parse.ts, types.ts, index.ts
  binary/     BinaryReader
  chunky/     shared Relic Chunky walk + splice
  header/     DATASDSC / DATABASE / DATAINFO / BADCOE
  ticks/      tick/chat demux
  actions/    packet decode, definitions, refine
  players/    ID linking, overrides, ambiguity
  metadata/   FKSTMETA
  mutate/     rename + map-path rewrite
  analytics/  CPM
  dates/      parseReplayDate
playground/   Vite UI (not shipped in dist/)
fixtures/     regression .rec files
```

---

## Credits

Based on research and logic from the Company of Heroes community (GameReplays.org) and original work by Sander Dijkstra. Rewritten for v2 as a modular, typed library with lean action data and shared header edit primitives.
