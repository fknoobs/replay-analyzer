import {
    embedPlayerSteamIds,
    parseHeader,
    parseReplay,
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
    const inputs = Array.from(
        steamIdRows.querySelectorAll<HTMLInputElement>(
            "input[data-player-name]",
        ),
    );

    for (const input of inputs) {
        const name = input.dataset.playerName;
        const steamId = input.value.trim();
        if (name && steamId) {
            steamIdsByName[name] = steamId;
        }
    }

    try {
        // Rewrite official header replayName, then (re)embed Steam ID trailer
        const renamed = setReplayName(
            currentFileBytes,
            replayNameInput.value,
        );
        const embedded = embedPlayerSteamIds(renamed, steamIdsByName);
        currentFileBytes = embedded;

        // Re-parse so header + steamIds match the downloaded bytes
        currentReplay = parseCurrentFile();

        const linked = currentReplay.players.filter((p) => p.steamId).length;
        statusDiv.textContent = `Wrote replay name "${currentReplay.replayName}" and Steam IDs for ${linked}/${currentReplay.players.length} players into .rec`;

        renderSteamIdInputs(currentReplay);
        displayResult(currentReplay);
        downloadRecFile(embedded, currentFileName);
    } catch (err) {
        console.error(err);
        statusDiv.textContent = `Error writing .rec: ${err}`;
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

function downloadRecFile(bytes: Uint8Array, originalName: string) {
    const base = originalName.replace(/\.rec$/i, "") || "replay";
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.edited.rec`;
    a.click();
    URL.revokeObjectURL(url);
}

function hideSteamIdsPanel() {
    steamIdsPanel.classList.remove("visible");
    steamIdRows.innerHTML = "";
    replayNameInput.value = "";
}

function renderSteamIdInputs(replay: ReplayData) {
    steamIdRows.innerHTML = "";
    replayNameInput.value = replay.replayName;

    if (!replay.players.length) {
        // Still allow renaming when header-only / no players
        steamIdsPanel.classList.add("visible");
        return;
    }

    for (const player of replay.players) {
        const row = document.createElement("div");
        row.className = "steam-id-row";

        const nameEl = document.createElement("span");
        nameEl.className = "player-name";
        nameEl.textContent = player.name;

        const factionEl = document.createElement("span");
        factionEl.className = "faction";
        factionEl.textContent = player.faction;

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Steam ID (e.g. 76561198...)";
        input.dataset.playerName = player.name;
        input.value = player.steamId ?? "";
        input.autocomplete = "off";

        row.append(nameEl, factionEl, input);
        steamIdRows.appendChild(row);
    }

    steamIdsPanel.classList.add("visible");
}

function displayResult(data: ReplayData) {
    const displayPlayers = data.players.map((player) => ({
        ...player,
        actions: data.actions.filter((action) => action.playerID === player.id),
    }));
    const dataForJson = { ...data, players: displayPlayers };

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
