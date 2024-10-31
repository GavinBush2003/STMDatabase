const express = require("express");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const app = express();
const port = 3000;

app.use(express.json());

const logDirectory = path.join(__dirname, "logs");
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

function detectDataloss(existingLog, currentLog) {
    let dataloss = false;

    // Compare stats (detect dataloss if current stat is less than previous stat)
    for (let stat in existingLog.stats) {
        if (existingLog.stats[stat] > currentLog.stats[stat]) {
            dataloss = true;
            console.log(`Stat mismatch detected: ${stat}`);
        }
    }

    // Compare swords (only flag dataloss if sword value was non-zero and is missing or decreased)
    for (let sword in existingLog.swords) {
        const prevSwordValue = existingLog.swords[sword];
        const currSwordValue = currentLog.swords[sword] || 0; // Default missing swords to 0
        if (prevSwordValue > 0 && currSwordValue < prevSwordValue) {
            dataloss = true;
            console.log(`Sword mismatch detected: ${sword}`);
        }
    }

    return dataloss;
}

app.post("/log", (req, res) => {
    const logData = req.body;
    const playerName = logData.playerName;

    // Read the existing log and dataloss log (if any)
    const existingLog = logger.readPlayerLog(playerName);
    const datalossLog = logger.readDatalossLog(playerName);

    if (existingLog) {
        // If dataloss is detected
        const isDataloss = detectDataloss(existingLog, logData);

        if (isDataloss) {
            console.log(`Dataloss detected for player ${playerName}`);

            // If dataloss log doesn't already exist, create it
            if (!datalossLog) {
                const datalossData = {
                    previousData: existingLog,
                    currentData: logData,
                };
                logger.writeDatalossLog(playerName, datalossData);
            }
            res.status(200).send("Dataloss detected and logged.");
        } else {
            // Check if dataloss log exists and if the player has recovered
            if (datalossLog && !detectDataloss(datalossLog.previousData, logData)) {
                console.log(`Player ${playerName} has recovered from dataloss.`);

                // Remove the dataloss log
                const datalossFilePath = path.join(logDirectory, `${playerName}-dataloss.json`);
                fs.unlinkSync(datalossFilePath);

                // Update the main log with the correct data (remove dataloss flag)
                logger.writePlayerLog(playerName, logData);

                res.status(200).send("Player has recovered. Dataloss log removed and log updated.");
                return;
            }

            // If no dataloss detected, just update the main log
            logger.writePlayerLog(playerName, logData);
            res.status(200).send("Log updated.");
        }
    } else {
        // If no existing log, create a new log
        logger.writePlayerLog(playerName, logData);
        res.status(200).send("New log created.");
    }
});

// DELETE log endpoint
app.delete("/logs/:playerName", (req, res) => {
    const playerName = req.params.playerName;

    // Get the log file path
    const logFilePath = logger.getPlayerLogFilePath(playerName);
    const datalossFilePath = path.join(logDirectory, `${playerName}-dataloss.json`);

    try {
        // Delete the log file
        if (fs.existsSync(logFilePath)) {
            fs.unlinkSync(logFilePath);
        }
        // Delete the dataloss log file if it exists
        if (fs.existsSync(datalossFilePath)) {
            fs.unlinkSync(datalossFilePath);
        }
        res.status(200).send("Log deleted successfully.");
    } catch (err) {
        console.error("Error deleting log:", err);
        res.status(500).send("Error deleting log.");
    }
});

app.get("/logs", (req, res) => {
    // Check if we should show only dataloss logs
    const showDataloss = req.query.dataloss === "true";

    const logFiles = fs.readdirSync(logDirectory).filter(file => file.endsWith(".json") && !file.includes("-dataloss"));

    const logEntries = logFiles.map(file => {
        const filePath = path.join(logDirectory, file);
        const stats = fs.statSync(filePath);
        const playerName = file.replace(".json", "");

        // Check if the player has a dataloss log
        const hasDataloss = fs.existsSync(path.join(logDirectory, `${playerName}-dataloss.json`));

        // If showing only dataloss logs, filter out non-dataloss logs
        if (showDataloss && !hasDataloss) {
            return null;
        }

        // If showing regular logs, filter out dataloss logs
        if (!showDataloss && hasDataloss) {
            return null;
        }

        return {
            name: playerName,
            time: stats.mtime.getTime(),
            hasDataloss: hasDataloss
        };
    }).filter(log => log !== null);

    const sortedLogs = logEntries.sort((a, b) => b.time - a.time);

    const responseHtml = `
    <html>
        <head>
            <title>Steal Time Modded Simulator Logs</title>
            <style>
                body {
                    font-family: 'Roboto', sans-serif;
                    background-color: #0a0a0a;
                    color: #ffffff;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                h1 {
                    color: #00bcd4;
                    text-align: center;
                    font-size: 3em;
                    margin-bottom: 20px;
                    text-shadow: 1px 1px 5px rgba(0, 188, 212, 0.6);
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    max-width: 1200px;
                    gap: 40px;
                }
                .search-container {
                    width: 100%;
                    max-width: 600px;
                    display: flex;
                    gap: 10px;
                }
                .search-container input {
                    width: 100%;
                    padding: 15px;
                    border-radius: 10px;
                    border: 1px solid #00bcd4;
                    background-color: #1a1a1a;
                    color: #ffffff;
                    font-size: 1.2em;
                    transition: border-color 0.3s ease;
                }
                .search-container input:focus {
                    border-color: #00bcd4;
                    outline: none;
                    box-shadow: 0 0 5px rgba(0, 188, 212, 0.5);
                }
                .logs-button, .dataloss-button {
                    padding: 12px;
                    font-size: 1.1em;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    transition: background-color 0.3s ease, transform 0.3s ease;
                    text-align: center;
                    text-decoration: none;
                }
                .logs-button {
                    background: linear-gradient(90deg, #00bcd4, #0097a7);
                    color: white;
                }
                .logs-button:hover {
                    background: linear-gradient(90deg, #0097a7, #00bcd4);
                    transform: scale(1.05);
                }
                .dataloss-button {
                    background: linear-gradient(90deg, #e74c3c, #c0392b);
                    color: white;
                }
                .dataloss-button:hover {
                    background: linear-gradient(90deg, #c0392b, #e74c3c);
                    transform: scale(1.05);
                }
                .logs {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 30px;
                    width: 100%;
                }
                .log-card {
                    border-radius: 15px;
                    padding: 20px;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    position: relative;
                    overflow: hidden;
                    background-color: #292b2f; /* Default card color */
                }
                .log-card.dataloss {
                    background-color: #FF0000; /* Red color for dataloss cards */
                }
                .log-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.8);
                }
                .log-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(135deg, rgba(0, 188, 212, 0.3), rgba(0, 188, 212, 0.1));
                    z-index: 0;
                    transition: opacity 0.3s ease;
                }
                .log-card.dataloss::before {
                    background: linear-gradient(135deg, rgba(0, 188, 212, 0.3), rgba(0, 188, 212, 0.1));
                }
                .log-card:hover::before {
                    opacity: 0.5;
                }
                .player-name {
                    font-size: 1.8em;
                    font-weight: bold;
                    color: #00bcd4;
                    margin-bottom: 10px;
                    position: relative;
                    z-index: 1;
                }
                .log-time {
                    font-size: 1em;
                    color: #ccc;
                    margin-top: 10px;
                    position: relative;
                    z-index: 1;
                }
                .button-container {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 15px;
                }
                .button {
                    padding: 12px;
                    font-size: 1.1em;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    transition: background-color 0.3s ease, transform 0.3s ease;
                    width: 100%;
                    box-sizing: border-box;
                    position: relative;
                    z-index: 1;
                    text-align: center;
                    text-decoration: none;
                }
                .button.view {
                    background: linear-gradient(90deg, #00bcd4, #0097a7);
                    color: white;
                }
                .button.view:hover {
                    background: linear-gradient(90deg, #0097a7, #00bcd4);
                    transform: scale(1.05);
                }
                .button.delete {
                    background: linear-gradient(90deg, #c0392b, #e74c3c);
                    color: white;
                }
                .button.delete:hover {
                    background: linear-gradient(90deg, #e74c3c, #c0392b);
                    transform: scale(1.05);
                }
            </style>
            <script>
                function verifyPassword(action, playerName) {
                    const password = prompt("Enter the password:");
                    if (password === "9018") {
                        if (action === "delete") {
                            fetch('/logs/' + playerName, {
                                method: 'DELETE'
                            }).then(response => {
                                if (response.ok) {
                                    alert("Log deleted successfully.");
                                    location.reload();
                                } else {
                                    alert("Error deleting log.");
                                }
                            });
                        } else {
                            window.location.href = '/logs/' + playerName;
                        }
                    } else {
                        alert("Incorrect password.");
                    }
                }

                // Search functionality for filtering logs
                function filterLogs(searchTerm) {
                    const logs = document.querySelectorAll('.log-card');
                    searchTerm = searchTerm.toLowerCase();
                    logs.forEach(log => {
                        const playerName = log.querySelector('.player-name').innerText.toLowerCase();
                        if (playerName.includes(searchTerm)) {
                            log.style.display = 'block';
                        } else {
                            log.style.display = 'none';
                        }
                    });
                }
            </script>
        </head>
        <body>
            <h1>Steal Time Modded Simulator Logs</h1>
            <div class="container">
                <div class="search-container">
                    <button class="logs-button" onclick="window.location.href='/logs'">Logs</button>
                    <input type="text" placeholder="Search logs..." onkeyup="filterLogs(this.value)">
                    <button class="dataloss-button" onclick="window.location.href='/logs?dataloss=true'">Dataloss</button>
                </div>
                <div class="logs">
                    ${sortedLogs.map(log => `
                        <div class="log-card ${log.hasDataloss ? 'dataloss' : ''}">
                            <div class="player-name">${log.name}</div>
                            <div class="log-time">Last Updated: ${new Date(log.time).toLocaleString()}</div>
                            <div class="button-container">
                                <a class="button view" href="/logs/${log.name}">View Log</a>
                                <button class="button delete" onclick="verifyPassword('delete', '${log.name}')">Delete Log</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </body>
    </html>
    `;
    res.status(200).send(responseHtml);
});

app.get("/logs/:playerName", (req, res) => {
    const playerName = req.params.playerName;
    const log = logger.readPlayerLog(playerName);
    const datalossLog = logger.readDatalossLog(playerName);

    const responseHtml = `
    <html>
        <head>
            <title>${datalossLog ? `Dataloss Detected for ${playerName}` : `Player Log for ${playerName}`}</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif; 
                    background-color: #1a1a1a; 
                    color: #e0e0e0; 
                    margin: 0; 
                    padding: 20px; 
                }
                h1 { 
                    color: #f39c12; 
                    text-align: left; 
                    margin-bottom: 20px; 
                }
                .container { 
                    background-color: #333; 
                    border-radius: 8px; 
                    padding: 20px; 
                    max-width: 800px; 
                    box-shadow: 0 0 20px rgba(0, 0, 0, 0.5); 
                    margin: auto; 
                }
                .grid {
                    display: grid; 
                    grid-template-columns: 1fr 1fr; 
                    gap: 20px; 
                }
                h2 { 
                    margin-top: 20px; 
                    margin-bottom: 10px; 
                }
                .scroll-box {
                    background-color: #444; 
                    border-radius: 5px; 
                    max-height: 200px; 
                    overflow-y: auto; 
                    padding: 10px; 
                    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5); 
                }
                ul { 
                    list-style-type: none; 
                    padding: 0; 
                    margin: 0; 
                }
                li { 
                    margin-bottom: 10px; 
                }
                textarea { 
                    width: 100%; 
                    height: 150px; 
                    background-color: #2c2c2c; 
                    color: #e0e0e0; 
                    border: none; 
                    border-radius: 5px; 
                    resize: none; 
                    margin-top: 10px; 
                }
                .button { 
                    margin-top: 10px; 
                    padding: 10px; 
                    background-color: #f39c12; 
                    color: #fff; 
                    cursor: pointer; 
                    border: none; 
                    border-radius: 5px; 
                }
                .button:hover { 
                    background-color: #e67e22; 
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>${datalossLog ? `Dataloss Detected for ${playerName}` : playerName}</h1>

                <div class="grid">
                    ${datalossLog ? `
                        <div>
                            <h2>Before Dataloss Stats</h2>
                            <div class="scroll-box">
                                <ul>${Object.entries(datalossLog.previousData.stats).map(([name, value]) => `<li>${name}: ${value}</li>`).join('')}</ul>
                            </div>
                        </div>
                        <div>
                            <h2>Before Dataloss Swords</h2>
                            <div class="scroll-box">
                                <ul>${Object.entries(datalossLog.previousData.swords).map(([name, value]) => `<li>${name}: ${value}</li>`).join('')}</ul>
                            </div>
                        </div>
                        <div>
                            <h2>After Dataloss Stats</h2>
                            <div class="scroll-box">
                                <ul>${Object.entries(datalossLog.currentData.stats).map(([name, value]) => `<li>${name}: ${value}</li>`).join('')}</ul>
                            </div>
                        </div>
                        <div>
                            <h2>After Dataloss Swords</h2>
                            <div class="scroll-box">
                                <ul>${Object.entries(datalossLog.currentData.swords).map(([name, value]) => `<li>${name}: ${value}</li>`).join('')}</ul>
                            </div>
                        </div>
                    ` : `
                        <div>
                            <h2>Stats</h2>
                            <div class="scroll-box">
                                <ul>${Object.entries(log.stats).map(([name, value]) => `<li>${name}: ${value}</li>`).join('')}</ul>
                            </div>
                        </div>
                        <div>
                            <h2>Swords</h2>
                            <div class="scroll-box">
                                <ul>${Object.entries(log.swords).map(([name, value]) => `<li>${name}: ${value}</li>`).join('')}</ul>
                            </div>
                        </div>
                    `}
                </div>

                <h2>Restore Scripts</h2>
                <h3>Restore Swords</h3>
                <textarea id="restoreSwords">${datalossLog ? logger.generateRestoreSwordsScript(playerName, datalossLog.previousData) : logger.generateRestoreSwordsScript(playerName, log)}</textarea>
                <button class="button" onclick="copyToClipboard('restoreSwords')">Copy Restore Swords</button>

                <h3>Restore Stats</h3>
                <textarea id="restoreStats">${datalossLog ? logger.generateRestoreStatsScript(playerName, datalossLog.previousData) : logger.generateRestoreStatsScript(playerName, log)}</textarea>
                <button class="button" onclick="copyToClipboard('restoreStats')">Copy Restore Stats</button>
            </div>

            <script>
                function copyToClipboard(elementId) {
                    const textarea = document.getElementById(elementId);
                    textarea.select();
                    document.execCommand('copy');
                    alert('Copied to clipboard');
                }
            </script>
        </body>
    </html>
    `;
    res.status(200).send(responseHtml);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
