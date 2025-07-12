let players = [];
let db = null;
let currentTeams = [];

// IndexedDB wrapper functions
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PlayerRatingDB', 2);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create players store
            if (!db.objectStoreNames.contains('players')) {
                const playersStore = db.createObjectStore('players', { keyPath: 'id' });
                playersStore.createIndex('name', 'name', { unique: false });
            }

            // Create images store
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images', { keyPath: 'playerId' });
            }

            // Create matches store
            if (!db.objectStoreNames.contains('matches')) {
                const matchesStore = db.createObjectStore('matches', { keyPath: 'id' });
                matchesStore.createIndex('date', 'date', { unique: false });
            }
        };
    });
}

async function savePlayer(player) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['players'], 'readwrite');
        const store = transaction.objectStore('players');
        const request = store.put(player);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllPlayers() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['players'], 'readonly');
        const store = transaction.objectStore('players');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deletePlayer(playerId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['players'], 'readwrite');
        const store = transaction.objectStore('players');
        const request = store.delete(playerId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveImage(playerId, file) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const request = store.put({ playerId: playerId, image: file });

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function getImage(playerId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(playerId);

        request.onsuccess = () => {
            if (request.result) {
                resolve(URL.createObjectURL(request.result.image));
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteImage(playerId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const request = store.delete(playerId);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Match database functions
async function saveMatch(match) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['matches'], 'readwrite');
        const store = transaction.objectStore('matches');
        const request = store.put(match);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllMatches() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['matches'], 'readonly');
        const store = transaction.objectStore('matches');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getMatchesByTimeFilter(timeFilter) {
    const allMatches = await getAllMatches();
    if (timeFilter === 'all') return allMatches;

    const now = new Date();
    const filterDate = new Date();

    if (timeFilter === 'week') {
        filterDate.setDate(now.getDate() - 7);
    } else if (timeFilter === 'month') {
        filterDate.setMonth(now.getMonth() - 1);
    } else if (timeFilter === 'today') {
        // Set to start of today (00:00:00)
        filterDate.setHours(0, 0, 0, 0);
    }

    return allMatches.filter(match => new Date(match.date) >= filterDate);
}

// Statistics calculation functions
async function getPlayerStats(playerId, timeFilter = 'all') {
    const matches = await getMatchesByTimeFilter(timeFilter);
    const playerMatches = matches.filter(match =>
        match.teams.some(team => team.players.includes(playerId))
    );

    const wins = playerMatches.filter(match => {
        const playerTeam = match.teams.find(team => team.players.includes(playerId));
        return playerTeam.result === 'win';
    }).length;

    const losses = playerMatches.length - wins;
    const winRate = playerMatches.length > 0 ? (wins / playerMatches.length) * 100 : 0;

    return {
        wins,
        losses,
        total: playerMatches.length,
        winRate: parseFloat(winRate.toFixed(1)),
        matches: playerMatches
    };
}

async function getLeaderboard(sortBy = 'winRate', timeFilter = 'all') {
    const allStats = [];

    for (const player of players) {
        const stats = await getPlayerStats(player.id, timeFilter);
        if (stats.total > 0) { // Only include players with matches
            allStats.push({
                player: player,
                stats: stats
            });
        }
    }

    // Sort by specified criteria
    allStats.sort((a, b) => {
        switch (sortBy) {
            case 'wins':
                return b.stats.wins - a.stats.wins;
            case 'total':
                return b.stats.total - a.stats.total;
            case 'winRate':
            default:
                return b.stats.winRate - a.stats.winRate;
        }
    });

    return allStats;
}

async function recordMatchResult(winningTeamIndex, teams, notes = '') {
    const matchId = Date.now();
    const matchDate = new Date().toISOString().split('T')[0];

    // Create match record
    const match = {
        id: matchId,
        date: matchDate,
        teams: teams.map((team, index) => ({
            players: team.map(p => p.id),
            average: parseFloat(team.reduce((sum, p) => sum + parseFloat(p.average), 0) / team.length).toFixed(1),
            result: index === winningTeamIndex ? 'win' : 'loss'
        })),
        notes: notes
    };

    // Save to database
    await saveMatch(match);

    return match;
}

async function recordMatchResultWithTeams(winningTeamIndex, losingTeamIndex, teams, notes = '') {
    const matchId = Date.now();
    const matchDate = new Date().toISOString().split('T')[0];

    const winningTeam = teams[winningTeamIndex];
    const losingTeam = teams[losingTeamIndex];

    // Create match record with teams that played
    const match = {
        id: matchId,
        date: matchDate,
        teams: [
            {
                players: winningTeam.map(p => p.id),
                average: parseFloat(winningTeam.reduce((sum, p) => sum + parseFloat(p.average), 0) / winningTeam.length).toFixed(1),
                result: 'win'
            },
            {
                players: losingTeam.map(p => p.id),
                average: parseFloat(losingTeam.reduce((sum, p) => sum + parseFloat(p.average), 0) / losingTeam.length).toFixed(1),
                result: 'loss'
            }
        ],
        notes: notes
    };

    // Save to database
    await saveMatch(match);

    return match;
}

// Migration function for existing localStorage data
async function migrateFromLocalStorage() {
    const oldPlayers = JSON.parse(localStorage.getItem('players') || '[]');
    if (oldPlayers.length > 0) {
        console.log('Migrating players from localStorage to IndexedDB...');
        for (const player of oldPlayers) {
            await savePlayer(player);
        }
        localStorage.removeItem('players');
        console.log('Migration completed!');
    }
}

// Migration function to update existing players to new color system
async function migrateToNewColorSystem() {
    const allPlayers = await getAllPlayers();
    let migrated = false;

    for (const player of allPlayers) {
        if (player.cardColor !== undefined) {
            // Remove old cardColor property
            delete player.cardColor;
            migrated = true;
        }

        // Add isIcon property if it doesn't exist
        if (player.isIcon === undefined) {
            player.isIcon = false;
            migrated = true;
        }

        if (migrated) {
            await savePlayer(player);
        }
    }

    if (migrated) {
        console.log('Migrated players to new color system!');
        players = await getAllPlayers();
    }
}

// Image preview functionality
document.getElementById('playerImage').addEventListener('change', function (e) {
    const file = e.target.files[0];
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
});

// Initialize IndexedDB when page loads
async function init() {
    try {
        await initDB();
        await migrateFromLocalStorage();
        await migrateToNewColorSystem();
        players = await getAllPlayers();
        displayPlayers();
        
        // Reset statistics filter dropdowns to match initial values
        const timeFilterDropdown = document.getElementById('timeFilter');
        if (timeFilterDropdown) {
            timeFilterDropdown.value = 'all';
        }
        
        const sortByDropdown = document.getElementById('sortBy');
        if (sortByDropdown) {
            sortByDropdown.value = 'winRate';
        }
        
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        alert('Failed to initialize database. Some features may not work.');
    }
}

init();

// Card category determination based on rating
function getCardCategory(average, isIcon = false) {
    if (isIcon) return 'icon';

    const rating = parseFloat(average);
    if (rating < 60) return 'wood';
    if (rating < 70) return 'bronze';
    if (rating < 80) return 'silver';
    return 'gold';
}

// Edit modal functionality
let editingPlayerId = null;

document.getElementById('editPlayerImage').addEventListener('change', function (e) {
    const file = e.target.files[0];
    const preview = document.getElementById('editImagePreview');
    const previewImg = document.getElementById('editPreviewImg');

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
});

async function editPlayer(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    editingPlayerId = playerId;

    // Fill the form with current values
    document.getElementById('editPlayerName').value = player.name;
    document.getElementById('editRiflessi').value = player.riflessi;
    document.getElementById('editPalleggio').value = player.palleggio;
    document.getElementById('editBacher').value = player.bacher;
    document.getElementById('editSchiacciata').value = player.schiacciata;
    document.getElementById('editQi').value = player.qi;
    document.getElementById('editIsIcon').checked = player.isIcon || false;

    // Show current image if exists
    if (player.hasImage) {
        try {
            const imageUrl = await getImage(player.id);
            if (imageUrl) {
                document.getElementById('editPreviewImg').src = imageUrl;
                document.getElementById('editImagePreview').style.display = 'block';
            }
        } catch (error) {
            console.error('Failed to load image:', error);
        }
    }

    // Show modal
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editPlayerForm').reset();
    document.getElementById('editImagePreview').style.display = 'none';
    editingPlayerId = null;
}

document.getElementById('editPlayerForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!editingPlayerId) return;

    const playerIndex = players.findIndex(p => p.id === editingPlayerId);
    if (playerIndex === -1) return;

    const imageFile = document.getElementById('editPlayerImage').files[0];
    const player = players[playerIndex];

    // Store old values for comparison
    const oldStats = {
        riflessi: player.riflessi,
        palleggio: player.palleggio,
        bacher: player.bacher,
        schiacciata: player.schiacciata,
        qi: player.qi,
        average: parseFloat(player.average)
    };

    // Update player data
    player.name = document.getElementById('editPlayerName').value;
    player.riflessi = parseInt(document.getElementById('editRiflessi').value);
    player.palleggio = parseInt(document.getElementById('editPalleggio').value);
    player.bacher = parseInt(document.getElementById('editBacher').value);
    player.schiacciata = parseInt(document.getElementById('editSchiacciata').value);
    player.qi = parseInt(document.getElementById('editQi').value);
    player.isIcon = document.getElementById('editIsIcon').checked;
    player.average = ((player.riflessi + player.palleggio + player.bacher + player.schiacciata + player.qi) / 5).toFixed(1);

    // Check if any stats changed
    const newStats = {
        riflessi: player.riflessi,
        palleggio: player.palleggio,
        bacher: player.bacher,
        schiacciata: player.schiacciata,
        qi: player.qi,
        average: parseFloat(player.average)
    };

    const hasChanges = Object.keys(oldStats).some(key => oldStats[key] !== newStats[key]);

    // Add history entry if stats changed
    if (hasChanges) {
        // Initialize history if it doesn't exist (for old players)
        if (!player.history) {
            player.history = [];
        }

        player.history.push({
            date: new Date().toISOString().split('T')[0],
            riflessi: player.riflessi,
            palleggio: player.palleggio,
            bacher: player.bacher,
            schiacciata: player.schiacciata,
            qi: player.qi,
            average: parseFloat(player.average),
            reason: 'Stats updated'
        });
    }

    // Handle image update
    if (imageFile) {
        try {
            await saveImage(editingPlayerId, imageFile);
            player.hasImage = true;
        } catch (error) {
            console.error('Failed to save image:', error);
        }
    }

    // Save to IndexedDB
    await savePlayer(player);

    closeEditModal();
    displayPlayers();
    alert('Player updated successfully!');
});

async function toggleAvailability(playerId) {
    const player = players.find(p => p.id === playerId);
    if (player) {
        player.available = !player.available;
        await savePlayer(player);
        displayPlayers();
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'players') {
        displayPlayers();
    } else if (tabName === 'statistics') {
        displayStatistics();
    }
}


document.getElementById('playerForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const playerId = Date.now();
    const imageFile = document.getElementById('playerImage').files[0];

    const player = {
        id: playerId,
        name: document.getElementById('playerName').value,
        riflessi: parseInt(document.getElementById('riflessi').value),
        palleggio: parseInt(document.getElementById('palleggio').value),
        bacher: parseInt(document.getElementById('bacher').value),
        schiacciata: parseInt(document.getElementById('schiacciata').value),
        qi: parseInt(document.getElementById('qi').value),
        hasImage: false,
        imageFileName: null,
        available: true,
        history: [],
        isIcon: document.getElementById('isIcon').checked
    };
    player.average = ((player.riflessi + player.palleggio + player.bacher + player.schiacciata + player.qi) / 5).toFixed(1);

    // Add initial history entry
    player.history.push({
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        riflessi: player.riflessi,
        palleggio: player.palleggio,
        bacher: player.bacher,
        schiacciata: player.schiacciata,
        qi: player.qi,
        average: parseFloat(player.average),
        reason: 'Initial rating'
    });

    // Save player to IndexedDB
    await savePlayer(player);

    // Save image if provided
    if (imageFile) {
        try {
            await saveImage(playerId, imageFile);
            player.hasImage = true;
        } catch (error) {
            console.error('Failed to save image:', error);
        }
    }

    // Update local array and refresh display
    players.push(player);
    displayPlayers();

    this.reset();
    document.getElementById('imagePreview').style.display = 'none';

    alert('Player added successfully!');
});

async function showFifaCard(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Update card content
    document.getElementById('fifaOverall').textContent = Math.round(player.average);
    document.getElementById('fifaPlayerName').textContent = player.name;
    document.getElementById('fifaRiflessi').textContent = player.riflessi;
    document.getElementById('fifaPalleggio').textContent = player.palleggio;
    document.getElementById('fifaBacher').textContent = player.bacher;
    document.getElementById('fifaSchiacciata').textContent = player.schiacciata;
    document.getElementById('fifaQi').textContent = player.qi;

    // Handle player photo
    const photoContainer = document.getElementById('fifaPlayerPhoto');
    if (player.hasImage) {
        try {
            const imageUrl = await getImage(player.id);
            if (imageUrl) {
                photoContainer.innerHTML = `<img src="${imageUrl}" class="fifa-player-photo" alt="${player.name}">`;
            } else {
                photoContainer.innerHTML = `<div class="fifa-player-placeholder">${player.name.charAt(0).toUpperCase()}</div>`;
            }
        } catch (error) {
            photoContainer.innerHTML = `<div class="fifa-player-placeholder">${player.name.charAt(0).toUpperCase()}</div>`;
        }
    } else {
        photoContainer.innerHTML = `<div class="fifa-player-placeholder">${player.name.charAt(0).toUpperCase()}</div>`;
    }

    // Apply card color and unavailable styling
    const fifaCard = document.querySelector('.fifa-card');

    // Reset all color classes
    fifaCard.className = 'fifa-card';

    // Check for special Marco Parisi card
    if (player.name.toLowerCase() === 'marco parisi') {
        fifaCard.classList.add('fifa-marco-parisi');
    } else {
        // Apply automatic color based on rating and icon status
        const cardCategory = getCardCategory(player.average, player.isIcon);
        fifaCard.classList.add(`fifa-${cardCategory}`);
    }

    // Apply unavailable styling if needed
    if (player.available === false) {
        fifaCard.classList.add('unavailable');
    }

    // Show modal
    document.getElementById('fifaModal').style.display = 'block';
}

function closeFifaCard() {
    document.getElementById('fifaModal').style.display = 'none';
}

function showPlayerGrowth(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Initialize history if it doesn't exist (for old players)
    if (!player.history || player.history.length === 0) {
        alert('No growth history available for this player yet.');
        return;
    }

    document.getElementById('growthPlayerName').textContent = `${player.name} - Season Growth`;

    // Calculate growth summary
    const firstEntry = player.history[0];
    const lastEntry = player.history[player.history.length - 1];

    const changes = {
        riflessi: lastEntry.riflessi - firstEntry.riflessi,
        palleggio: lastEntry.palleggio - firstEntry.palleggio,
        bacher: lastEntry.bacher - firstEntry.bacher,
        schiacciata: lastEntry.schiacciata - firstEntry.schiacciata,
        qi: lastEntry.qi - firstEntry.qi,
        average: lastEntry.average - firstEntry.average
    };

    // Create summary
    const summaryHtml = `
                <h4>Season Progress</h4>
                <div class="growth-changes">
                    <div class="growth-change">
                        <div class="growth-change-label">RIF</div>
                        <div class="growth-change-value ${changes.riflessi >= 0 ? 'positive' : 'negative'}">
                            ${changes.riflessi >= 0 ? '+' : ''}${changes.riflessi}
                        </div>
                    </div>
                    <div class="growth-change">
                        <div class="growth-change-label">PAL</div>
                        <div class="growth-change-value ${changes.palleggio >= 0 ? 'positive' : 'negative'}">
                            ${changes.palleggio >= 0 ? '+' : ''}${changes.palleggio}
                        </div>
                    </div>
                    <div class="growth-change">
                        <div class="growth-change-label">BAC</div>
                        <div class="growth-change-value ${changes.bacher >= 0 ? 'positive' : 'negative'}">
                            ${changes.bacher >= 0 ? '+' : ''}${changes.bacher}
                        </div>
                    </div>
                    <div class="growth-change">
                        <div class="growth-change-label">SCH</div>
                        <div class="growth-change-value ${changes.schiacciata >= 0 ? 'positive' : 'negative'}">
                            ${changes.schiacciata >= 0 ? '+' : ''}${changes.schiacciata}
                        </div>
                    </div>
                    <div class="growth-change">
                        <div class="growth-change-label">QI</div>
                        <div class="growth-change-value ${changes.qi >= 0 ? 'positive' : 'negative'}">
                            ${changes.qi >= 0 ? '+' : ''}${changes.qi}
                        </div>
                    </div>
                    <div class="growth-change">
                        <div class="growth-change-label">AVG</div>
                        <div class="growth-change-value ${changes.average >= 0 ? 'positive' : 'negative'}">
                            ${changes.average >= 0 ? '+' : ''}${changes.average.toFixed(1)}
                        </div>
                    </div>
                </div>
            `;

    // Create timeline
    const timelineHtml = player.history.slice().reverse().map(entry => `
                <div class="growth-entry">
                    <div>
                        <div class="growth-date">${entry.date}</div>
                        <div style="font-size: 12px; color: #6c757d;">${entry.reason}</div>
                    </div>
                    <div class="growth-stats">
                        <div class="growth-stat">RIF: ${entry.riflessi}</div>
                        <div class="growth-stat">PAL: ${entry.palleggio}</div>
                        <div class="growth-stat">BAC: ${entry.bacher}</div>
                        <div class="growth-stat">SCH: ${entry.schiacciata}</div>
                        <div class="growth-stat">QI: ${entry.qi}</div>
                    </div>
                    <div class="growth-average">AVG: ${entry.average.toFixed(1)}</div>
                </div>
            `).join('');

    document.getElementById('growthSummary').innerHTML = summaryHtml;
    document.getElementById('growthTimeline').innerHTML = timelineHtml;

    document.getElementById('growthModal').style.display = 'flex';
}

function closeGrowthModal() {
    document.getElementById('growthModal').style.display = 'none';
}

async function displayPlayers() {
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    if (players.length === 0) {
        playersList.innerHTML = '<p style="text-align: center; color: #666;">No players added yet.</p>';
        return;
    }

    for (const player of players) {
        const playerCard = document.createElement('div');

        // Add unavailable class if player is not available
        const unavailableClass = player.available === false ? ' player-unavailable' : '';

        // List View Only
        playerCard.className = 'player-card' + unavailableClass;
        playerCard.innerHTML = `
                    <div class="player-card-controls">
                        <button class="icon-btn edit-icon" onclick="editPlayer(${player.id})" title="Edit Player">✏️</button>
                        <button class="icon-btn delete-icon" onclick="deletePlayerFromDB(${player.id})" title="Delete Player">🗑️</button>
                    </div>
                    <div class="player-name">${player.name} ${player.available === false ? '(Unavailable)' : ''}</div>
                    <div class="player-stats">
                        <div class="stat">
                            <div class="stat-label">Riflessi</div>
                            <div class="stat-value">${player.riflessi}</div>
                        </div>
                        <div class="stat">
                            <div class="stat-label">Palleggio</div>
                            <div class="stat-value">${player.palleggio}</div>
                        </div>
                        <div class="stat">
                            <div class="stat-label">Bacher</div>
                            <div class="stat-value">${player.bacher}</div>
                        </div>
                        <div class="stat">
                            <div class="stat-label">Schiacciata</div>
                            <div class="stat-value">${player.schiacciata}</div>
                        </div>
                        <div class="stat">
                            <div class="stat-label">QI</div>
                            <div class="stat-value">${player.qi}</div>
                        </div>
                    </div>
                    <div class="player-average">Average: ${player.average}</div>
                    <div class="player-actions">
                        <button class="fifa-card-btn" onclick="showFifaCard(${player.id})">FIFA Card</button>
                        <button class="edit-btn" onclick="showPlayerGrowth(${player.id})" style="background: #17a2b8;">Growth</button>
                        <button class="availability-btn ${player.available === false ? 'unavailable' : ''}" onclick="toggleAvailability(${player.id})">
                            ${player.available === false ? 'Unavailable' : 'Available'}
                        </button>
                    </div>
                `;

        playersList.appendChild(playerCard);
    }
}

async function deletePlayerFromDB(playerId) {
    if (confirm('Are you sure you want to delete this player?')) {
        const player = players.find(p => p.id === playerId);

        try {
            // Delete player from IndexedDB
            await deletePlayer(playerId);

            // Delete image if exists
            if (player && player.hasImage) {
                await deleteImage(playerId);
            }

            // Update local array
            players = players.filter(p => p.id !== playerId);
            displayPlayers();
        } catch (error) {
            console.error('Failed to delete player:', error);
            alert('Failed to delete player');
        }
    }
}

function generateTeams() {
    const numTeams = parseInt(document.getElementById('numTeams').value);

    // Filter only available players
    const availablePlayers = players.filter(player => player.available !== false);

    if (availablePlayers.length < numTeams) {
        alert(`Need at least ${numTeams} available players to generate ${numTeams} teams! Currently have ${availablePlayers.length} available players.`);
        return;
    }

    // Sort available players by average rating (highest to lowest)
    const sortedPlayers = [...availablePlayers].sort((a, b) => parseFloat(b.average) - parseFloat(a.average));

    // Initialize teams
    const teams = Array.from({ length: numTeams }, () => []);

    // Snake draft with randomized team order per round
    const rounds = Math.ceil(sortedPlayers.length / numTeams);
    let playerIndex = 0;

    for (let round = 0; round < rounds; round++) {
        // Create randomized team order for this round
        const teamOrder = Array.from({ length: numTeams }, (_, i) => i);

        // Shuffle the team order for this round
        for (let i = teamOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [teamOrder[i], teamOrder[j]] = [teamOrder[j], teamOrder[i]];
        }

        // Assign players in this round using the randomized order
        for (let i = 0; i < numTeams && playerIndex < sortedPlayers.length; i++) {
            const teamIndex = teamOrder[i];
            teams[teamIndex].push(sortedPlayers[playerIndex]);
            playerIndex++;
        }
    }

    // Store current teams globally for match recording
    currentTeams = teams;

    // Calculate team averages
    const teamAverages = teams.map(team => {
        if (team.length === 0) return 0;
        const sum = team.reduce((acc, player) => acc + parseFloat(player.average), 0);
        return (sum / team.length).toFixed(1);
    });

    // Display teams
    const teamsContainer = document.getElementById('teamsContainer');
    const teamColors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#5ee7df', '#b490ca', '#a8edea', '#ffecd2', '#fcb69f'];

    teamsContainer.innerHTML = `
                <div class="teams-container">
                    ${teams.map((team, index) => `
                        <div class="team" style="border-left: 4px solid ${teamColors[index]};">
                            <div class="team-header">Team ${index + 1}</div>
                            <div class="team-average">Average: ${teamAverages[index]}</div>
                            <ul class="team-players">
                                ${team.map(player => `
                                    <li class="team-player">
                                        <span style="font-weight: bold;">${player.name}</span> 
                                        <span style="color: #666;">(${player.average})</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="margin-bottom: 10px; color: #333;">Team Balance Summary</h4>
                    <div style="font-size: 14px; color: #666;">
                        <p>Highest Average: ${Math.max(...teamAverages.map(Number)).toFixed(1)}</p>
                        <p>Lowest Average: ${Math.min(...teamAverages.map(Number)).toFixed(1)}</p>
                        <p>Difference: ${(Math.max(...teamAverages.map(Number)) - Math.min(...teamAverages.map(Number))).toFixed(1)}</p>
                    </div>
                </div>
                <div id="matchResultSection" style="margin-top: 20px; padding: 15px; background: #e8f4f8; border-radius: 8px; border: 2px solid #17a2b8;">
                    <h4 style="margin-bottom: 15px; color: #333;">Record Match Result</h4>
                    <div style="margin-bottom: 15px;">
                        <label for="winningTeam" style="display: block; margin-bottom: 8px; font-weight: bold;">Select Winning Team:</label>
                        <select id="winningTeam" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="">-- Select Winner --</option>
                            ${teams.map((team, index) => `
                                <option value="${index}">Team ${index + 1} (Avg: ${teamAverages[index]})</option>
                            `).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="losingTeam" style="display: block; margin-bottom: 8px; font-weight: bold;">Select Losing Team:</label>
                        <select id="losingTeam" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="">-- Select Loser --</option>
                            ${teams.map((team, index) => `
                                <option value="${index}">Team ${index + 1} (Avg: ${teamAverages[index]})</option>
                            `).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label for="matchNotes" style="display: block; margin-bottom: 8px; font-weight: bold;">Notes (optional):</label>
                        <input type="text" id="matchNotes" placeholder="Match notes..." style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                    </div>
                    <button onclick="recordMatch()" class="btn btn-success" style="width: 100%;">Record Match Result</button>
                </div>
            `;
}

async function recordMatch() {
    const winningTeamIndex = parseInt(document.getElementById('winningTeam').value);
    const losingTeamIndex = parseInt(document.getElementById('losingTeam').value);
    const notes = document.getElementById('matchNotes').value;

    // Validation
    if (isNaN(winningTeamIndex) || winningTeamIndex < 0 || winningTeamIndex >= currentTeams.length) {
        alert('Please select a winning team!');
        return;
    }

    if (isNaN(losingTeamIndex) || losingTeamIndex < 0 || losingTeamIndex >= currentTeams.length) {
        alert('Please select a losing team!');
        return;
    }

    if (winningTeamIndex === losingTeamIndex) {
        alert('Winning team and losing team cannot be the same!');
        return;
    }

    if (currentTeams.length === 0) {
        alert('No teams generated yet!');
        return;
    }

    try {
        await recordMatchResultWithTeams(winningTeamIndex, losingTeamIndex, currentTeams, notes);
        alert('Match result recorded successfully!');

        // Reset form
        document.getElementById('winningTeam').value = '';
        document.getElementById('losingTeam').value = '';
        document.getElementById('matchNotes').value = '';

    } catch (error) {
        console.error('Failed to record match:', error);
        alert('Failed to record match result');
    }
}

// Statistics display functions
let currentTimeFilter = 'all';
let currentSortBy = 'winRate';

async function displayStatistics() {
    try {
        const leaderboard = await getLeaderboard(currentSortBy, currentTimeFilter);
        const statisticsContent = document.getElementById('statisticsContent');

        if (leaderboard.length === 0) {
            statisticsContent.innerHTML = '<p style="text-align: center; color: #666; margin-top: 20px;">No match data available yet.</p>';
            return;
        }

        let html = '<div class="teams-container">';

        leaderboard.forEach((entry, index) => {
            const { player, stats } = entry;
            const rank = index + 1;

            html += `
                        <div class="team" style="margin-bottom: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div>
                                    <span style="font-size: 18px; font-weight: bold; color: #333;">#${rank} ${player.name}</span>
                                    <span style="font-size: 14px; color: #666; margin-left: 10px;">(Rating: ${player.average})</span>
                                </div>
                                <div style="font-size: 24px; font-weight: bold; color: #667eea;">
                                    ${stats.winRate}%
                                </div>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 10px; margin-bottom: 10px;">
                                <div style="text-align: center; padding: 8px; background: #e8f5e8; border-radius: 4px;">
                                    <div style="font-size: 16px; font-weight: bold; color: #28a745;">${stats.wins}</div>
                                    <div style="font-size: 12px; color: #666;">Wins</div>
                                </div>
                                <div style="text-align: center; padding: 8px; background: #ffeaea; border-radius: 4px;">
                                    <div style="font-size: 16px; font-weight: bold; color: #dc3545;">${stats.losses}</div>
                                    <div style="font-size: 12px; color: #666;">Losses</div>
                                </div>
                                <div style="text-align: center; padding: 8px; background: #f0f0f0; border-radius: 4px;">
                                    <div style="font-size: 16px; font-weight: bold; color: #333;">${stats.total}</div>
                                    <div style="font-size: 12px; color: #666;">Total</div>
                                </div>
                            </div>
                        </div>
                    `;
        });

        html += '</div>';
        statisticsContent.innerHTML = html;

    } catch (error) {
        console.error('Failed to display statistics:', error);
        document.getElementById('statisticsContent').innerHTML = '<p style="text-align: center; color: #dc3545; margin-top: 20px;">Error loading statistics.</p>';
    }
}

function filterStats(timeFilter) {
    currentTimeFilter = timeFilter;
    displayStatistics();
}

function sortLeaderboard(sortBy) {
    currentSortBy = sortBy;
    displayStatistics();
}

async function exportData() {
    try {
        const allPlayers = await getAllPlayers();
        const allMatches = await getAllMatches();
        const data = {
            players: allPlayers,
            matches: allMatches,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'player-ratings-export.json';
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed!');
    }
}

async function importData() {
    const file = document.getElementById('importFile').files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.players && Array.isArray(data.players)) {
                // Clear existing data first
                await clearAllData(false);

                // Import players
                for (const player of data.players) {
                    await savePlayer(player);
                }

                // Import matches if they exist
                if (data.matches && Array.isArray(data.matches)) {
                    for (const match of data.matches) {
                        await saveMatch(match);
                    }
                }

                players = await getAllPlayers();
                displayPlayers();
                alert('Data imported successfully!');
            } else {
                alert('Invalid file format!');
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert('Error reading file!');
        }
    };
    reader.readAsText(file);
}

async function clearAllData(confirm = true) {
    if (!confirm || window.confirm('Are you sure you want to clear all data? This cannot be undone!')) {
        try {
            // Clear all data stores
            const transaction = db.transaction(['players', 'images', 'matches'], 'readwrite');
            const playersStore = transaction.objectStore('players');
            const imagesStore = transaction.objectStore('images');
            const matchesStore = transaction.objectStore('matches');

            await playersStore.clear();
            await imagesStore.clear();
            await matchesStore.clear();

            players = [];
            currentTeams = [];
            displayPlayers();
            document.getElementById('teamsContainer').innerHTML = '';
            document.getElementById('statisticsContent').innerHTML = '<p style="text-align: center; color: #666; margin-top: 20px;">No match data available yet.</p>';

            if (confirm) alert('All data cleared!');
        } catch (error) {
            console.error('Clear failed:', error);
            alert('Failed to clear data!');
        }
    }
}

// Custom match recording functionality
let customTeam1Players = [];
let customTeam2Players = [];

function refreshCustomPlayers() {
    const container = document.getElementById('availablePlayersCustom');
    const availablePlayers = players.filter(p =>
        p.available !== false &&
        !customTeam1Players.includes(p.id) &&
        !customTeam2Players.includes(p.id)
    );

    if (availablePlayers.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; margin: 0; font-size: 14px;">No available players</p>';
        return;
    }

    container.innerHTML = availablePlayers.map(player => `
                <div style="
                    background: #fff; 
                    border: 2px solid #667eea; 
                    padding: 6px 12px; 
                    border-radius: 15px; 
                    cursor: pointer; 
                    font-size: 14px; 
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                " onclick="addToCustomTeam(${player.id})"
                   onmouseover="this.style.background='#667eea'; this.style.color='white';"
                   onmouseout="this.style.background='#fff'; this.style.color='#333';">
                    <span>${player.name}</span>
                    <span style="font-size: 12px; opacity: 0.7;">(${player.average})</span>
                </div>
            `).join('');
}

function addToCustomTeam(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Create a custom modal for team selection
    const modal = document.createElement('div');
    modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            `;

    modal.innerHTML = `
                <div style="
                    background: white;
                    padding: 25px;
                    border-radius: 12px;
                    max-width: 350px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
                ">
                    <h3 style="margin-bottom: 15px; color: #333;">Add ${player.name} to which team?</h3>
                    <p style="color: #666; margin-bottom: 20px; font-size: 14px;">Rating: ${player.average}</p>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button style="
                            background: #667eea;
                            color: white;
                            border: none;
                            padding: 12px 20px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 16px;
                            font-weight: bold;
                            transition: all 0.2s;
                        " onclick="selectTeam(${playerId}, 1)" 
                           onmouseover="this.style.background='#4c63d2'"
                           onmouseout="this.style.background='#667eea'">
                            Team 1
                        </button>
                        <button style="
                            background: #f093fb;
                            color: white;
                            border: none;
                            padding: 12px 20px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 16px;
                            font-weight: bold;
                            transition: all 0.2s;
                        " onclick="selectTeam(${playerId}, 2)"
                           onmouseover="this.style.background='#e067d6'"
                           onmouseout="this.style.background='#f093fb'">
                            Team 2
                        </button>
                    </div>
                    <button style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        margin-top: 15px;
                    " onclick="closeTeamModal()">Cancel</button>
                </div>
            `;

    document.body.appendChild(modal);
    window.currentTeamModal = modal;
}

function selectTeam(playerId, teamNumber) {
    if (teamNumber === 1) {
        customTeam1Players.push(playerId);
        updateCustomTeamDisplay(1);
    } else {
        customTeam2Players.push(playerId);
        updateCustomTeamDisplay(2);
    }

    closeTeamModal();
    refreshCustomPlayers();
    checkCustomMatchReady();
}

function closeTeamModal() {
    if (window.currentTeamModal) {
        document.body.removeChild(window.currentTeamModal);
        window.currentTeamModal = null;
    }
}

function updateCustomTeamDisplay(teamNumber) {
    const container = document.getElementById(`customTeam${teamNumber}`);
    const teamPlayers = teamNumber === 1 ? customTeam1Players : customTeam2Players;
    const teamColor = teamNumber === 1 ? '#667eea' : '#f093fb';

    if (teamPlayers.length === 0) {
        container.innerHTML = `<p style="color: #999; text-align: center; margin: 0; font-size: 14px;">Click players below to add to Team ${teamNumber}</p>`;
        return;
    }

    const playerObjects = teamPlayers.map(id => players.find(p => p.id === id));
    const teamAverage = playerObjects.reduce((sum, p) => sum + parseFloat(p.average), 0) / playerObjects.length;

    container.innerHTML = `
                <div style="margin-bottom: 8px; text-align: center;">
                    <strong>Average: ${teamAverage.toFixed(1)}</strong>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${playerObjects.map(player => `
                        <div style="
                            background: white; 
                            border: 2px solid ${teamColor}; 
                            padding: 4px 8px; 
                            border-radius: 12px; 
                            font-size: 13px;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        ">
                            <span>${player.name}</span>
                            <span style="font-size: 11px; opacity: 0.7;">(${player.average})</span>
                            <button onclick="removeFromCustomTeam(${player.id}, ${teamNumber})" 
                                    style="background: none; border: none; cursor: pointer; color: #dc3545; font-size: 14px; padding: 0;">×</button>
                        </div>
                    `).join('')}
                </div>
            `;
}

function removeFromCustomTeam(playerId, teamNumber) {
    if (teamNumber === 1) {
        customTeam1Players = customTeam1Players.filter(id => id !== playerId);
        updateCustomTeamDisplay(1);
    } else {
        customTeam2Players = customTeam2Players.filter(id => id !== playerId);
        updateCustomTeamDisplay(2);
    }

    refreshCustomPlayers();
    checkCustomMatchReady();
}

function checkCustomMatchReady() {
    const resultDiv = document.getElementById('customMatchResult');
    if (customTeam1Players.length > 0 && customTeam2Players.length > 0) {
        resultDiv.style.display = 'block';
    } else {
        resultDiv.style.display = 'none';
    }
}

function clearCustomTeams() {
    customTeam1Players = [];
    customTeam2Players = [];
    updateCustomTeamDisplay(1);
    updateCustomTeamDisplay(2);
    refreshCustomPlayers();
    checkCustomMatchReady();

    // Reset form
    const winnerRadios = document.querySelectorAll('input[name="customWinner"]');
    winnerRadios.forEach(radio => radio.checked = false);
    document.getElementById('customMatchNotes').value = '';
}

async function recordCustomMatch() {
    const winnerRadio = document.querySelector('input[name="customWinner"]:checked');
    const notes = document.getElementById('customMatchNotes').value;

    if (!winnerRadio) {
        alert('Please select a winning team!');
        return;
    }

    if (customTeam1Players.length === 0 || customTeam2Players.length === 0) {
        alert('Both teams must have at least one player!');
        return;
    }

    try {
        // Get player objects for both teams
        const team1Objects = customTeam1Players.map(id => players.find(p => p.id === id));
        const team2Objects = customTeam2Players.map(id => players.find(p => p.id === id));

        // Create teams array for recordMatchResultWithTeams function
        const teams = [team1Objects, team2Objects];
        const winningTeamIndex = winnerRadio.value === 'team1' ? 0 : 1;
        const losingTeamIndex = winnerRadio.value === 'team1' ? 1 : 0;

        // Use existing function to record match
        await recordMatchResultWithTeams(winningTeamIndex, losingTeamIndex, teams, notes || 'Custom match');

        alert('Custom match recorded successfully!');
        clearCustomTeams();

    } catch (error) {
        console.error('Failed to record custom match:', error);
        alert('Failed to record custom match result');
    }
}

// P2P Data Sharing functionality
let peer = null;
let currentConnection = null;
let isDisconnectedFromServer = false;
let shouldAutoReconnect = false;

function initializeP2P() {
    const customId = document.getElementById('customPeerId').value.trim();
    const initBtn = document.getElementById('initP2PBtn');

    initBtn.textContent = 'Initializing...';
    initBtn.disabled = true;

    // Create peer with custom ID if provided, otherwise auto-generate
    peer = customId ? new Peer(customId) : new Peer();

    peer.on('open', function (id) {
        document.getElementById('myPeerId').value = id;
        document.getElementById('peerStatus').textContent = 'Ready to connect';
        document.getElementById('peerStatus').style.color = '#28a745';
        document.getElementById('p2pInterface').style.display = 'block';
        initBtn.style.display = 'none';

        if (isDisconnectedFromServer) {
            logP2P('Successfully reconnected to signaling server!');
        } else {
            logP2P(`Your Peer ID: ${id}`);
            logP2P('P2P initialized successfully');
        }

        isDisconnectedFromServer = false;
        shouldAutoReconnect = true;
    });

    peer.on('error', function (err) {
        console.error('Peer error:', err);
        document.getElementById('peerStatus').textContent = 'Connection error';
        document.getElementById('peerStatus').style.color = '#dc3545';
        initBtn.textContent = 'Retry P2P Connection';
        initBtn.disabled = false;
        logP2P(`Error: ${err.message}`);

        if (err.type === 'unavailable-id') {
            alert('This Peer ID is already taken. Please choose a different one or leave empty for auto-generation.');
            document.getElementById('customPeerId').focus();
        }
    });

    peer.on('connection', function (conn) {
        currentConnection = conn;
        handleConnection(conn);
    });

    peer.on('disconnected', function () {
        isDisconnectedFromServer = true;
        document.getElementById('peerStatus').textContent = 'Disconnected from server';
        document.getElementById('peerStatus').style.color = '#dc3545';
        logP2P('Disconnected from signaling server (will auto-reconnect when app becomes active)');
        if (shouldAutoReconnect) {
            attemptReconnectP2P();
        }
    });
}

function connectToPeer() {
    const remotePeerId = document.getElementById('remotePeerId').value.trim();
    if (!remotePeerId) {
        alert('Please enter a remote peer ID');
        return;
    }

    if (!peer) {
        alert('Peer not initialized. Please wait and try again.');
        return;
    }

    logP2P(`Connecting to ${remotePeerId}...`);
    currentConnection = peer.connect(remotePeerId);
    handleConnection(currentConnection);
}

function handleConnection(conn) {
    conn.on('open', function () {
        document.getElementById('p2pActions').style.display = 'block';
        document.getElementById('connectBtn').textContent = 'Connected';
        document.getElementById('connectBtn').disabled = true;
        logP2P('Connected! You can now send/receive data.');
    });

    conn.on('data', function (data) {
        logP2P('Received data from peer');
        if (confirm('Received data from peer. Do you want to import it? This will replace your current data.')) {
            importP2PData(data);
        } else {
            logP2P('Data import cancelled by user');
        }
    });

    conn.on('close', function () {
        disconnectP2P();
        logP2P('Connection closed');
    });

    conn.on('error', function (err) {
        console.error('Connection error:', err);
        logP2P(`Connection error: ${err.message}`);
    });
}

async function sendDataP2P() {
    if (!currentConnection || !currentConnection.open) {
        alert('No active connection. Please connect to a peer first.');
        return;
    }

    try {
        logP2P('Preparing data to send...');
        const allPlayers = await getAllPlayers();
        const allMatches = await getAllMatches();
        const data = {
            players: allPlayers,
            matches: allMatches,
            exportDate: new Date().toISOString(),
            source: 'p2p'
        };

        currentConnection.send(data);
        logP2P(`Data sent successfully! (${allPlayers.length} players, ${allMatches.length} matches)`);
    } catch (error) {
        console.error('Failed to send data:', error);
        logP2P(`Failed to send data: ${error.message}`);
        alert('Failed to send data!');
    }
}

async function importP2PData(data) {
    try {
        if (data.players && Array.isArray(data.players)) {
            logP2P('Importing received data...');

            // Clear existing data first
            await clearAllData(false);

            // Import players
            for (const player of data.players) {
                await savePlayer(player);
            }

            // Import matches if they exist
            if (data.matches && Array.isArray(data.matches)) {
                for (const match of data.matches) {
                    await saveMatch(match);
                }
            }

            players = await getAllPlayers();
            displayPlayers();
            logP2P(`Import successful! (${data.players.length} players, ${data.matches?.length || 0} matches)`);
            alert('P2P data imported successfully!');
        } else {
            logP2P('Invalid data format received');
            alert('Invalid data format received from peer!');
        }
    } catch (error) {
        console.error('Import failed:', error);
        logP2P(`Import failed: ${error.message}`);
        alert('Error importing P2P data!');
    }
}

function disconnectP2P() {
    shouldAutoReconnect = false;

    if (currentConnection) {
        currentConnection.close();
        currentConnection = null;
    }

    if (peer) {
        peer.disconnect();
    }

    document.getElementById('p2pActions').style.display = 'none';
    document.getElementById('connectBtn').textContent = 'Connect';
    document.getElementById('connectBtn').disabled = false;
    document.getElementById('remotePeerId').value = '';
    document.getElementById('peerStatus').textContent = 'Manually disconnected';
    document.getElementById('peerStatus').style.color = '#6c757d';
    logP2P('Manually disconnected - auto-reconnect disabled');
}

function copyPeerId() {
    const peerIdInput = document.getElementById('myPeerId');
    peerIdInput.select();
    document.execCommand('copy');

    // Visual feedback
    const originalText = peerIdInput.nextElementSibling.textContent;
    peerIdInput.nextElementSibling.textContent = 'Copied!';
    setTimeout(() => {
        peerIdInput.nextElementSibling.textContent = originalText;
    }, 1000);
}

function logP2P(message) {
    const log = document.getElementById('p2pLog');
    const timestamp = new Date().toLocaleTimeString();
    log.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    log.scrollTop = log.scrollHeight;
}

function toggleP2PLogs() {
    const container = document.getElementById('p2pLogContainer');
    const button = document.getElementById('logToggleBtn');

    if (container.style.display === 'none') {
        container.style.display = 'block';
        button.innerHTML = '📋 Hide Connection Logs';
    } else {
        container.style.display = 'none';
        button.innerHTML = '📋 Show Connection Logs';
    }
}

function clearP2PLogs() {
    const log = document.getElementById('p2pLog');
    log.innerHTML = '';
    logP2P('Log cleared');
}

function attemptReconnectP2P() {
    if (!peer || !isDisconnectedFromServer || !shouldAutoReconnect || document.hidden) {
        return;
    }

    logP2P('Attempting to reconnect to signaling server...');
    document.getElementById('peerStatus').textContent = 'Reconnecting...';
    document.getElementById('peerStatus').style.color = '#ffc107';

    try {
        peer.reconnect();

        // Set up a timeout in case reconnection fails
        setTimeout(() => {
            if (isDisconnectedFromServer && shouldAutoReconnect) {
                logP2P('Reconnection timeout - will try again next time app becomes active');
                document.getElementById('peerStatus').textContent = 'Reconnection failed';
                document.getElementById('peerStatus').style.color = '#dc3545';
            }
        }, 10000); // 10 second timeout

    } catch (error) {
        logP2P(`Reconnection failed: ${error.message}`);
        document.getElementById('peerStatus').textContent = 'Reconnection failed';
        document.getElementById('peerStatus').style.color = '#dc3545';
    }
}

// Handle page visibility changes (when user switches back to app)
function handleVisibilityChange() {
    logP2P('App became active - checking connection status');
    // Small delay to ensure the browser has fully restored the app
    setTimeout(attemptReconnectP2P, 1000);
}

// Initialize custom match display when page loads
document.addEventListener('DOMContentLoaded', function () {
    // Add event listener to tab button to refresh custom players when Teams tab is clicked
    const teamsTabButton = document.querySelector('button[onclick="showTab(\'teams\')"]');
    if (teamsTabButton) {
        teamsTabButton.addEventListener('click', function () {
            setTimeout(() => {
                refreshCustomPlayers();
                updateCustomTeamDisplay(1);
                updateCustomTeamDisplay(2);
                checkCustomMatchReady();
            }, 100);
        });
    }

    // Add Page Visibility API listener for auto-reconnection
    document.addEventListener('visibilitychange', handleVisibilityChange);
});