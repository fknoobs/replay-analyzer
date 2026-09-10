/**
 * Public API for `@fknoobs/replay-parser` v2.
 *
 * Re-exports the parse entry points, data model, player-ID helpers, CPM
 * analytics, FKSTMETA trailer utilities, and header mutators (rename / local
 * map paths). See the package README for end-to-end usage.
 *
 * @packageDocumentation
 */
export * from "./types";
export { BinaryReader } from "./binary/reader";
export { parseReplay, parseHeader } from "./parse";
export { parseReplayDate } from "./dates/parse-replay-date";
export { applyPlayerSteamIds } from "./players/apply-steam-ids";
export { applyPlayerIds } from "./players/apply-ids";
export { getUnresolvedPlayerIds, type UnclaimedPlayerId, type UnresolvedPlayerIds, } from "./players/ambiguity";
export { playerCpm, playerCpmLabel, isAiTakeoverAction, isCpmExcludedAction, actionsUntilAiTakeover, cpmEligibleActions, countCpmCommands, cpmDurationMinutes, CPM_EXCLUDED_UNIT_COMMAND_IDS, type CpmAction, } from "./analytics/cpm";
export { extractReplayMetadata, hasReplayMetadataTrailer, hasReplayMetadata, stripReplayMetadata, resetReplayMetadata, embedReplayMetadata, embedPlayerSteamIds, embedPlayerIds, type ReplayMetadata, type ExtractedReplay, } from "./metadata/fkstmeta";
export { setReplayName } from "./mutate/set-replay-name";
export { defaultLocalDocumentsRoot, toLocalMapArchivePath, findMapArchivePaths, rewriteLocalMapArchivePaths, prepareForLocalCoh, type RewriteLocalMapPathOptions, type RewriteLocalMapPathResult, type PrepareForLocalCohOptions, type PrepareForLocalCohResult, } from "./mutate/rewrite-local-map-path";
