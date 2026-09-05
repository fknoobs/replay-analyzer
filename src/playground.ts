import {
    embedPlayerIds,
    embedPlayerSteamIds,
    getUnresolvedPlayerIds,
    hasReplayMetadata,
    parseHeader,
    parseReplay,
    resetReplayMetadata,
    setReplayName,
    type ReplayData,
} from "./index";

const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const outputDiv = document.getElementById("output") as HTMLDivElement;
const statusDiv = document.getElementById("status") as HTMLDivElement;
const steamIdsPanel = document.getElementById("steamIdsPanel") as HTMLDivElement;
const steamIdRows = document.getElementById("steamIdRows") as HTMLDivElement;
const replayNameInput = document.getElementById(
    "replayNameInput",
) as HTMLInputElement;
const applySteamIdsBtn = document.getElementById(
    "applySteamIdsBtn",
) as HTMLButtonElement;
const resetMetadataBtn = document.getElementById(
    "resetMetadataBtn",
) as HTMLButtonElement;
const ambiguityHint = document.getElementById(
    "ambiguityHint",
) as HTMLParagraphElement;

/** Last parsed replay; used so Steam IDs can be applied without re-parsing. */
let currentReplay: ReplayData | null = null;
/** Original file bytes (may already include a metadata trailer). */
let currentFileBytes: Uint8Array | null = null;
let currentFileName = "replay.rec";
let currentMode: "full" | "header" = "full";

fileInput.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    statusDiv.textContent = `Reading ${file.name}...`;
    outputDiv.innerHTML = "";
    hideSteamIdsPanel();
    currentReplay = null;
    currentFileBytes = null;
    currentFileName = file.name;

    try {
        const arrayBuffer = await file.arrayBuffer();
        currentFileBytes = new Uint8Array(arrayBuffer);
        currentMode = (
            document.querySelector(
                'input[name="mode"]:checked',
            ) as HTMLInputElement
        ).value as "full" | "header";

        statusDiv.textContent = `Parsing ${file.name} (${currentMode} mode)...`;

        // Small delay to allow UI to update
        setTimeout(() => {
            const startTime = performance.now();

            try {
                currentReplay = parseCurrentFile();

                const endTime = performance.now();
                statusDiv.textContent = `Parsed in ${(endTime - startTime).toFixed(2)}ms`;

                renderSteamIdInputs(currentReplay);
                updateResetButtonState();
                displayResult(currentReplay);
            } catch (err) {
                console.error(err);
                statusDiv.textContent = `Error: ${err}`;
            }
        }, 10);
    } catch (err) {
        console.error(err);
        statusDiv.textContent = `Error reading file: ${err}`;
    }
});

applySteamIdsBtn.addEventListener("click", () => {
    if (!currentReplay || !currentFileBytes) return;

    const steamIdsByName: Record<string, string> = {};
    const playerIdsByName: Record<string, number> = {};
    const steamInputs = Array.from(
        steamIdRows.querySelectorAll<HTMLInputElement>(
            "input[data-player-name]",
        ),
    );
    const idSelects = Array.from(
        steamIdRows.querySelectorAll<HTMLSelectElement>(
            "select[data-player-name]",
        ),
    );

    for (const input of steamInputs) {
        const name = input.dataset.playerName;
        const steamId = input.value.trim();
        if (name && steamId) {
            steamIdsByName[name] = steamId;
        }
    }

    for (const select of idSelects) {
        const name = select.dataset.playerName;
        const raw = select.value.trim();
        if (name && raw) {
            const id = Number(raw);
            if (Number.isInteger(id) && id !== 0) {
                playerIdsByName[name] = id;
            }
        }
    }

    // Keep already-resolved IDs so re-download does not drop them
    for (const player of currentReplay.players) {
        if (
            player.id !== undefined &&
            player.id !== 0 &&
            playerIdsByName[player.name] === undefined
        ) {
            playerIdsByName[player.name] = player.id;
        }
    }

    try {
        // Rewrite official header replayName, then (re)embed metadata trailer
        let next = setReplayName(currentFileBytes, replayNameInput.value);
        next = embedPlayerSteamIds(next, steamIdsByName);
        next = embedPlayerIds(next, playerIdsByName);
        currentFileBytes = next;

        // Re-parse so header + metadata match the downloaded bytes
        currentReplay = parseCurrentFile();

        const linkedSteam = currentReplay.players.filter((p) => p.steamId)
            .length;
        const linkedIds = currentReplay.players.filter(
            (p) => p.id !== undefined && p.id !== 0,
        ).length;
        statusDiv.textContent = `Wrote replay name "${currentReplay.replayName}", Steam IDs ${linkedSteam}/${currentReplay.players.length}, player IDs ${linkedIds}/${currentReplay.players.length}`;

        renderSteamIdInputs(currentReplay);
        updateResetButtonState();
        displayResult(currentReplay);
        downloadRecFile(next, currentFileName, "edited");
    } catch (err) {
        console.error(err);
        statusDiv.textContent = `Error writing .rec: ${err}`;
    }
});

resetMetadataBtn.addEventListener("click", () => {
    if (!currentFileBytes) return;

    try {
        if (!hasReplayMetadata(currentFileBytes)) {
            statusDiv.textContent = "No custom FKSTMETA trailer to remove";
            return;
        }

        const reset = resetReplayMetadata(currentFileBytes);
        currentFileBytes = reset;
        currentReplay = parseCurrentFile();

        statusDiv.textContent =
            "Removed FKSTMETA trailer (Steam / player IDs); downloaded original replay body";

        renderSteamIdInputs(currentReplay);
        updateResetButtonState();
        displayResult(currentReplay);
        downloadRecFile(reset, currentFileName, "reset");
    } catch (err) {
        console.error(err);
        statusDiv.textContent = `Error resetting .rec: ${err}`;
    }
});

function parseCurrentFile(): ReplayData {
    if (!currentFileBytes) {
        throw new Error("No replay file loaded");
    }
    if (currentMode === "header") {
        return parseHeader(currentFileBytes);
    }
    return parseReplay(currentFileBytes, { includeHexData: true });
}

function updateResetButtonState() {
    resetMetadataBtn.disabled =
        !currentFileBytes || !hasReplayMetadata(currentFileBytes);
}

function downloadRecFile(
    bytes: Uint8Array,
    originalName: string,
    suffix: string,
) {
    const base = originalName.replace(/\.rec$/i, "") || "replay";
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.${suffix}.rec`;
    a.click();
    URL.revokeObjectURL(url);
}

function hideSteamIdsPanel() {
    steamIdsPanel.classList.remove("visible");
    steamIdRows.innerHTML = "";
    replayNameInput.value = "";
    ambiguityHint.textContent = "";
    resetMetadataBtn.disabled = true;
}

function renderSteamIdInputs(replay: ReplayData) {
    steamIdRows.innerHTML = "";
    replayNameInput.value = replay.replayName;

    const unresolved = getUnresolvedPlayerIds(replay);
    if (unresolved.unassignedPlayers.length > 0) {
        const idHints = unresolved.unclaimedIds
            .map((c) => {
                const doc = c.doctrineName ? ` ${c.doctrineName}` : "";
                const fac = c.faction ? ` (${c.faction})` : "";
                return `${c.id}${doc}${fac}`;
            })
            .join(", ");
        ambiguityHint.textContent = unresolved.unclaimedIds.length
            ? `Ambiguous player IDs: pick an ID for unassigned teammates (${idHints}). Saved into FKSTMETA.`
            : "Some players have no action playerID yet.";
    } else {
        ambiguityHint.textContent = "";
    }

    if (!replay.players.length) {
        // Still allow renaming when header-only / no players
        steamIdsPanel.classList.add("visible");
        return;
    }

    const idOptions = buildIdOptions(replay);

    for (const player of replay.players) {
        const row = document.createElement("div");
        row.className = "steam-id-row";

        const nameEl = document.createElement("span");
        nameEl.className = "player-name";
        nameEl.textContent = player.name;

        const factionEl = document.createElement("span");
        factionEl.className = "faction";
        factionEl.textContent = player.faction;

        const idSelect = document.createElement("select");
        idSelect.dataset.playerName = player.name;
        idSelect.title = "Action player ID (MPN + 1000)";

        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "player ID…";
        idSelect.appendChild(emptyOpt);

        for (const opt of idOptions) {
            const option = document.createElement("option");
            option.value = String(opt.id);
            option.textContent = opt.label;
            idSelect.appendChild(option);
        }

        if (player.id !== undefined && player.id !== 0) {
            // Ensure current id is in the list
            if (
                !Array.from(idSelect.options).some(
                    (o) => o.value === String(player.id),
                )
            ) {
                const option = document.createElement("option");
                option.value = String(player.id);
                option.textContent = String(player.id);
                idSelect.appendChild(option);
            }
            idSelect.value = String(player.id);
        }

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Steam ID (e.g. 76561198...)";
        input.dataset.playerName = player.name;
        input.value = player.steamId ?? "";
        input.autocomplete = "off";

        row.append(nameEl, factionEl, idSelect, input);
        steamIdRows.appendChild(row);
    }

    steamIdsPanel.classList.add("visible");
}

function buildIdOptions(
    replay: ReplayData,
): Array<{ id: number; label: string }> {
    const byId = new Map<number, string>();

    for (const player of replay.players) {
        if (player.id !== undefined && player.id !== 0) {
            const doc = player.doctrineName
                ? ` — ${player.doctrineName}`
                : "";
            byId.set(player.id, `${player.id}${doc}`);
        }
    }

    for (const claim of getUnresolvedPlayerIds(replay).unclaimedIds) {
        if (byId.has(claim.id)) continue;
        const doc = claim.doctrineName ? ` — ${claim.doctrineName}` : "";
        const fac = claim.faction ? ` (${claim.faction})` : "";
        byId.set(claim.id, `${claim.id}${doc}${fac}`);
    }

    // Always offer the standard 1000–1007 range as fallback
    for (let id = 1000; id <= 1007; id++) {
        if (!byId.has(id)) byId.set(id, String(id));
    }

    return Array.from(byId.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([id, label]) => ({ id, label }));
}

function displayResult(data: ReplayData) {
    const unresolved = getUnresolvedPlayerIds(data);
    const displayPlayers = data.players.map((player) => ({
        ...player,
        actions: data.actions.filter((action) => action.playerID === player.id),
    }));
    const dataForJson = {
        ...data,
        players: displayPlayers,
        unresolvedPlayerIds: unresolved,
    };

    // Create a download button for the full data
    const blob = new Blob([JSON.stringify(dataForJson, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const downloadBtn = document.createElement("a");
    downloadBtn.href = url;
    downloadBtn.download = "replay_data.json";
    downloadBtn.textContent = "Download Full JSON";
    downloadBtn.style.display = "inline-block";
    downloadBtn.style.marginBottom = "10px";
    downloadBtn.style.padding = "8px 16px";
    downloadBtn.style.backgroundColor = "#28a745";
    downloadBtn.style.color = "white";
    downloadBtn.style.textDecoration = "none";
    downloadBtn.style.borderRadius = "4px";

    outputDiv.innerHTML = "";
    outputDiv.appendChild(downloadBtn);

    // Prepare data for display (truncate actions if too many)
    let displayData: unknown = dataForJson;
    if (
        dataForJson.actions &&
        Array.isArray(dataForJson.actions) &&
        dataForJson.actions.length > 100
    ) {
        displayData = {
            ...dataForJson,
            actions: [
                ...dataForJson.actions.slice(0, 50),
                `... ${dataForJson.actions.length - 50} more actions hidden (download full JSON to see all) ...`,
            ],
        };
    }

    const json = JSON.stringify(displayData, null, 2);
    const highlighted = syntaxHighlight(json);

    const pre = document.createElement("pre");
    pre.innerHTML = highlighted;
    outputDiv.appendChild(pre);
}

function syntaxHighlight(json: string): string {
    json = json
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
            let cls = "number";
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = "key";
                } else {
                    cls = "string";
                }
            } else if (/true|false/.test(match)) {
                cls = "boolean";
            } else if (/null/.test(match)) {
                cls = "null";
            }
            return '<span class="' + cls + '">' + match + "</span>";
        },
    );
}
