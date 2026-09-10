import {
    embedPlayerIds,
    embedPlayerSteamIds,
    findMapArchivePaths,
    getUnresolvedPlayerIds,
    hasReplayMetadataTrailer,
    parseHeader,
    parseReplay,
    playerCpm,
    rewriteLocalMapArchivePaths,
    setReplayName,
    stripReplayMetadata,
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
const localDocumentsInput = document.getElementById(
    "localDocumentsInput",
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

const LOCAL_DOCUMENTS_KEY = "cohLocalDocuments";

function loadLocalDocumentsSetting(): string {
    try {
        return localStorage.getItem(LOCAL_DOCUMENTS_KEY)?.trim() || "";
    } catch {
        return "";
    }
}

function saveLocalDocumentsSetting(value: string) {
    try {
        if (value.trim()) localStorage.setItem(LOCAL_DOCUMENTS_KEY, value.trim());
    } catch {
        /* ignore quota / private mode */
    }
}

function getLocalDocuments(): string | undefined {
    const fromInput = localDocumentsInput.value.trim();
    if (fromInput) return fromInput;
    const stored = loadLocalDocumentsSetting();
    return stored || undefined;
}

/** Strip FKSTMETA and rewrite foreign workshop map paths for local CoH. */
function buildCohBody(upload: Uint8Array): {
    body: Uint8Array;
    pathRewrites: { from: string; to: string }[];
} {
    const stripped = stripReplayMetadata(upload);
    const localDocuments = getLocalDocuments();
    if (!localDocuments) {
        return { body: stripped.slice(), pathRewrites: [] };
    }
    const { bytes, rewritten } = rewriteLocalMapArchivePaths(stripped, {
        localDocuments,
    });
    return { body: bytes, pathRewrites: rewritten };
}

localDocumentsInput.value = loadLocalDocumentsSetting();
localDocumentsInput.addEventListener("change", () => {
    saveLocalDocumentsSetting(localDocumentsInput.value);
    // Rebuild CoH body if a file is already loaded
    if (uploadedFileBytes) {
        const { body, pathRewrites } = buildCohBody(uploadedFileBytes);
        cohBodyBytes = body;
        currentFileBytes = hasReplayMetadataTrailer(uploadedFileBytes)
            ? uploadedFileBytes.slice()
            : body.slice();
        const note =
            pathRewrites.length > 0
                ? `Rewrote ${pathRewrites.length} map path(s) for local CoH.`
                : "Local Documents updated (no foreign map paths found).";
        statusDiv.textContent = note;
        updateResetButtonState();
    }
});

/** Last parsed replay; used so Steam IDs can be applied without re-parsing. */
let currentReplay: ReplayData | null = null;
/**
 * Exact bytes from the file picker (may already include FKSTMETA if re-opening
 * an edited download).
 */
let uploadedFileBytes: Uint8Array | null = null;
/**
 * CoH / Replay Manager compatible body: upload with any FKSTMETA trailer
 * stripped and foreign workshop paths rewritten to Local Documents.
 * Apply starts from this; Reset restores this.
 */
let cohBodyBytes: Uint8Array | null = null;
/** Working copy (may include FKSTMETA and/or a rewritten replayName). */
let currentFileBytes: Uint8Array | null = null;
let currentFileName = "replay.rec";
let currentMode: "full" | "header" = "full";
/** Official header replayName on the CoH body (for dirty checks). */
let baselineReplayName = "";

fileInput.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    statusDiv.textContent = `Reading ${file.name}...`;
    outputDiv.innerHTML = "";
    hideSteamIdsPanel();
    currentReplay = null;
    uploadedFileBytes = null;
    cohBodyBytes = null;
    currentFileBytes = null;
    currentFileName = file.name;
    baselineReplayName = "";

    try {
        const arrayBuffer = await file.arrayBuffer();
        uploadedFileBytes = new Uint8Array(arrayBuffer).slice();
        const { body, pathRewrites } = buildCohBody(uploadedFileBytes);
        cohBodyBytes = body;
        currentFileBytes = uploadedFileBytes.slice();
        currentMode = (
            document.querySelector(
                'input[name="mode"]:checked',
            ) as HTMLInputElement
        ).value as "full" | "header";

        const foreignPaths = findMapArchivePaths(uploadedFileBytes);
        const needsLocalDocs =
            foreignPaths.length > 0 && !getLocalDocuments();

        statusDiv.textContent = `Parsing ${file.name} (${currentMode} mode)...`;

        // Small delay to allow UI to update
        setTimeout(() => {
            const startTime = performance.now();

            try {
                currentReplay = parseCurrentFile();
                // Baseline name from the CoH body (ignores trailer-only edits)
                baselineReplayName = parseHeader(cohBodyBytes!).replayName;

                const endTime = performance.now();
                const notes: string[] = [];
                if (hasReplayMetadataTrailer(uploadedFileBytes!)) {
                    notes.push(
                        "upload had FKSTMETA — Reset exports trailer-free body",
                    );
                }
                if (pathRewrites.length > 0) {
                    notes.push(
                        `rewrote ${pathRewrites.length} map archive path(s) → local Documents`,
                    );
                } else if (needsLocalDocs) {
                    notes.push(
                        "foreign workshop path found — set Local Documents (e.g. C:\\Users\\You\\Documents) then Reset",
                    );
                }
                const trailerNote = notes.length ? ` (${notes.join("; ")})` : "";
                statusDiv.textContent = `Parsed in ${(endTime - startTime).toFixed(2)}ms${trailerNote}`;

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
    if (!currentReplay || !currentFileBytes || !cohBodyBytes) return;

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
        saveLocalDocumentsSetting(localDocumentsInput.value);
        // Always start from trailer-free CoH body so we never stack trailers
        // or rewrite on top of a previous edited download.
        let next: Uint8Array = cohBodyBytes.slice();
        const desiredName = replayNameInput.value;
        if (desiredName !== baselineReplayName) {
            next = setReplayName(next, desiredName);
        }

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
        statusDiv.textContent = `Wrote "${currentReplay.replayName}", Steam ${linkedSteam}/${currentReplay.players.length}, IDs ${linkedIds}/${currentReplay.players.length}. Note: .edited.rec has FKSTMETA — CoH needs Reset export.`;

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
    if (!cohBodyBytes || !uploadedFileBytes) return;

    try {
        saveLocalDocumentsSetting(localDocumentsInput.value);
        // Rebuild in case Local Documents changed since load
        const { body, pathRewrites } = buildCohBody(uploadedFileBytes);
        cohBodyBytes = body;
        const reset = cohBodyBytes.slice();
        currentFileBytes = reset;
        currentReplay = parseCurrentFile();
        baselineReplayName = currentReplay.replayName;

        const pathNote =
            pathRewrites.length > 0
                ? `; rewrote ${pathRewrites.length} map path(s) to local Documents`
                : "";
        statusDiv.textContent = `Exported CoH / Replay Manager compatible body (no FKSTMETA trailer${pathNote})`;

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
    return parseReplay(currentFileBytes);
}

function updateResetButtonState() {
    if (!cohBodyBytes || !currentFileBytes) {
        resetMetadataBtn.disabled = true;
        return;
    }
    // Dirty when working copy still has a trailer or differs from CoH body.
    const dirty =
        hasReplayMetadataTrailer(currentFileBytes) ||
        !bytesEqual(currentFileBytes, cohBodyBytes);
    resetMetadataBtn.disabled = !dirty;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function downloadRecFile(
    bytes: Uint8Array,
    originalName: string,
    suffix: string,
) {
    const base = originalName.replace(/\.rec$/i, "") || "replay";
    // Copy into a standalone ArrayBuffer so Blob never sees a shared/offset view.
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

        const cpmEl = document.createElement("span");
        cpmEl.className = "cpm";
        cpmEl.title = "Commands per minute (C2A-style)";
        if (currentMode === "header") {
            cpmEl.textContent = "CPM —";
        } else {
            cpmEl.textContent = `CPM ${playerCpm(replay, player.id)}`;
        }

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

        row.append(nameEl, factionEl, cpmEl, idSelect, input);
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
        cpm: currentMode === "header" ? null : playerCpm(data, player.id),
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
