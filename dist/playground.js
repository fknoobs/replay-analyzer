import { parseReplay, parseHeader } from './index';
const fileInput = document.getElementById('fileInput');
const outputDiv = document.getElementById('output');
const statusDiv = document.getElementById('status');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file)
        return;
    statusDiv.textContent = `Reading ${file.name}...`;
    outputDiv.innerHTML = '';
    try {
        const arrayBuffer = await file.arrayBuffer();
        const mode = document.querySelector('input[name="mode"]:checked').value;
        statusDiv.textContent = `Parsing ${file.name} (${mode} mode)...`;
        // Small delay to allow UI to update
        setTimeout(() => {
            const startTime = performance.now();
            let result;
            try {
                if (mode === 'header') {
                    result = parseHeader(new Uint8Array(arrayBuffer));
                }
                else {
                    result = parseReplay(new Uint8Array(arrayBuffer));
                }
                const endTime = performance.now();
                statusDiv.textContent = `Parsed in ${(endTime - startTime).toFixed(2)}ms`;
                displayResult(result);
            }
            catch (err) {
                console.error(err);
                statusDiv.textContent = `Error: ${err}`;
            }
        }, 10);
    }
    catch (err) {
        console.error(err);
        statusDiv.textContent = `Error reading file: ${err}`;
    }
});
function displayResult(data) {
    data.players?.forEach((player) => {
        player.actions = data.actions.filter((action) => action.playerID === player.id);
    });
    console.log(data.players);
    // Create a download button for the full data
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = 'replay_data.json';
    downloadBtn.textContent = 'Download Full JSON';
    downloadBtn.style.display = 'inline-block';
    downloadBtn.style.marginBottom = '10px';
    downloadBtn.style.padding = '8px 16px';
    downloadBtn.style.backgroundColor = '#28a745';
    downloadBtn.style.color = 'white';
    downloadBtn.style.textDecoration = 'none';
    downloadBtn.style.borderRadius = '4px';
    outputDiv.innerHTML = '';
    outputDiv.appendChild(downloadBtn);
    // Prepare data for display (truncate actions if too many)
    let displayData = data;
    if (data.actions && Array.isArray(data.actions) && data.actions.length > 100) {
        displayData = { ...data };
        displayData.actions = [
            ...data.actions.slice(0, 50),
            `... ${data.actions.length - 50} more actions hidden (download full JSON to see all) ...`
        ];
    }
    const json = JSON.stringify(displayData, null, 2);
    const highlighted = syntaxHighlight(json);
    const pre = document.createElement('pre');
    pre.innerHTML = highlighted;
    outputDiv.appendChild(pre);
}
function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'key';
            }
            else {
                cls = 'string';
            }
        }
        else if (/true|false/.test(match)) {
            cls = 'boolean';
        }
        else if (/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}
