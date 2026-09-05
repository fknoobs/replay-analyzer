import { isDoctrinal } from "./action-definitions";
import {
    getDoctrineName,
    type ReplayData,
} from "./replay-types";

const normalizePlayerName = (name: string): string => name.trim().toLowerCase();

const updateActionPlayerNames = (replay: ReplayData) => {
    const playerMap = new Map<number, string>();
    for (const p of replay.players) {
        if (p.id !== undefined && p.id !== 0) {
            playerMap.set(p.id, p.name);
        }
    }

    for (const action of replay.actions) {
        const name = playerMap.get(action.playerID);
        if (name !== undefined) {
            action.playerName = name;
        }
    }
};

const attachPlayerDoctrines = (replay: ReplayData) => {
    for (const player of replay.players) {
        if (player.id === undefined || player.id === 0) {
            player.doctrine = undefined;
            player.doctrineName = undefined;
            continue;
        }

        player.doctrine =
            replay.actions.find(
                (action) =>
                    isDoctrinal(action.commandID) &&
                    action.playerID === player.id &&
                    getDoctrineName(action.objectID) !== undefined,
            )?.objectID || undefined;

        player.doctrineName =
            player.doctrine !== undefined
                ? getDoctrineName(player.doctrine)
                : undefined;
    }
};

/**
 * Applies in-game action playerIDs to replay players by matching names
 * (trim + case-insensitive). Mutates `replay.players` / action names / doctrines
 * in place and returns `replay`.
 *
 * Use when chat/faction inference cannot disambiguate same-faction teammates.
 */
export const applyPlayerIds = (
    replay: ReplayData,
    idsByName: Record<string, number>,
): ReplayData => {
    const lookup = new Map<string, number>();
    for (const [name, id] of Object.entries(idsByName)) {
        if (typeof id === "number" && id !== 0) {
            lookup.set(normalizePlayerName(name), id);
        }
    }

    for (const player of replay.players) {
        const id = lookup.get(normalizePlayerName(player.name));
        if (id !== undefined) {
            player.id = id;
        }
    }

    updateActionPlayerNames(replay);
    attachPlayerDoctrines(replay);

    return replay;
};
