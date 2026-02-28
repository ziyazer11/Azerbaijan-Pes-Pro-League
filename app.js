// --- Supabase Configuration ---
// TO USER: Replace these with your own Supabase Project URL and Anon Key
const SB_URL = 'https://qhfyudkkvmgpsukdcylj.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZnl1ZGtrdm1ncHN1a2RjeWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzAzNTMsImV4cCI6MjA4Nzg0NjM1M30.s2TPO4Zf55rGwHnMTdLEKLIQe2Mhpa-FVX8v2Ee_MPk';

let supabaseClient = null;
if (SB_URL !== 'YOUR_SUPABASE_PROJECT_URL' && SB_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
    try {
        supabaseClient = supabase.createClient(SB_URL, SB_KEY);
    } catch (e) {
        console.error("Supabase initialization failed:", e.message);
    }
} else {
    console.warn("Supabase keys are missing. Data will not be saved to the database.");
}

// State Management
let teams = [];
let matches = [];
let zones = { next: 2, playoff: 2, out: 2 };
let isAdmin = false;
let tickerText = "Welcome to Azerbaijan Pes Pro League!";
let predictionsGroup = []; // All raw predictions
let leaderboard = []; // Prepared leaderboard data

// Credentials
const ADMIN_EMAIL = "ziyazer11@gmail.com";
const ADMIN_PASS = "Hasanzade2011!";

// DOM Elements
const standingsBody = document.getElementById('standings-body');
const scheduleList = document.getElementById('schedule-list');
const resultsList = document.getElementById('results-list');
const adminLoginModal = document.getElementById('admin-login-modal');
const adminDashboard = document.getElementById('admin-dashboard');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    updateUIForAuth();
});

async function loadInitialData() {
    if (!supabaseClient) {
        console.warn("Supabase not connected. Using empty data.");
        renderStandings();
        renderSchedule();
        populateSelects();
        return;
    }
    try {
        // Load Teams
        const { data: teamsData, error: teamsError } = await supabaseClient
            .from('teams')
            .select('*')
            .order('pts', { ascending: false })
            .order('gd', { ascending: false })
            .order('gf', { ascending: false });

        if (teamsError) throw teamsError;
        teams = teamsData || [];

        // Load Matches
        const { data: matchesData, error: matchesError } = await supabaseClient
            .from('matches')
            .select('*')
            .order('dateTime', { ascending: true });

        if (matchesError) throw matchesError;
        matches = matchesData || [];

        // Load Zones
        const { data: zonesData, error: zonesError } = await supabaseClient
            .from('zones')
            .select('*')
            .single();

        if (zonesError && zonesError.code !== 'PGRST116') throw zonesError;
        if (zonesData) zones = zonesData;

        // Load Settings (Ticker) - Handle potential missing table
        try {
            const { data: settingsData, error: sErr } = await supabaseClient.from('settings').select('*').eq('id', 'global').single();
            if (settingsData && !sErr) {
                tickerText = settingsData.newsText;
                updateTickerUI();
            }
        } catch (e) {
            console.warn("Settings table not found or inaccessible.");
        }

        // Load Predictions - Handle potential missing table
        try {
            const { data: predData, error: pErr } = await supabaseClient.from('predictions').select('*');
            if (predData && !pErr) {
                predictionsGroup = predData;
                calculateLeaderboard();
            }
        } catch (e) {
            console.warn("Predictions table not found or inaccessible.");
        }

        renderStandings();
        renderSchedule();
        renderMatchHistory();
        populateSelects();
        startCountdownTimer();

    } catch (err) {
        console.error('Core Error loading data:', err.message);
        // Still try to render whatever we have
        renderStandings();
        renderSchedule();
    }
}

function updateTickerUI() {
    const el = document.getElementById('ticker-content');
    if (el) el.textContent = tickerText;
}

async function updateNewsTicker() {
    if (!isAdmin || !supabaseClient) return;
    const input = document.getElementById('admin-news-input');
    const text = input.value;
    if (!text) return;

    const { error } = await supabaseClient.from('settings').upsert([{ id: 'global', newsText: text }]);
    if (error) {
        alert("Error updating news: " + error.message);
        return;
    }
    tickerText = text;
    updateTickerUI();
    input.value = '';
    alert("Official News Updated!");
}

// --- Countdown Logic ---
let countdownInterval = null;

function startCountdownTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const nextMatch = matches
        .filter(m => !m.played && new Date(m.dateTime) > new Date())
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))[0];

    const container = document.getElementById('next-match-countdown');
    if (!nextMatch) {
        if (container) container.style.display = 'none';
        return;
    }

    if (container) container.style.display = 'flex';

    const now = new Date().getTime();
    const matchTime = new Date(nextMatch.dateTime).getTime();
    const diff = matchTime - now;

    if (diff <= 0) {
        if (container) container.style.display = 'none';
        return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    const dEl = document.getElementById('days');
    const hEl = document.getElementById('hours');
    const mEl = document.getElementById('minutes');
    const sEl = document.getElementById('seconds');

    if (dEl) dEl.textContent = d.toString().padStart(2, '0');
    if (hEl) hEl.textContent = h.toString().padStart(2, '0');
    if (mEl) mEl.textContent = m.toString().padStart(2, '0');
    if (sEl) sEl.textContent = s.toString().padStart(2, '0');
}

// --- Authentication ---
function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;

    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
        isAdmin = true;
        closeModal('admin-login-modal');
        updateUIForAuth();
        alert("Logged in as Admin");
    } else {
        alert("Invalid credentials");
    }
}

function logout() {
    isAdmin = false;
    updateUIForAuth();
}

function updateUIForAuth() {
    const adminPanel = document.getElementById('admin-section');
    const loginBtn = document.getElementById('login-trigger-btn');
    const joinSection = document.getElementById('join-section');

    if (isAdmin) {
        if (adminPanel) adminPanel.style.display = 'block';
        if (joinSection) joinSection.style.display = 'none';
        loginBtn.textContent = 'LOGOUT';
        loginBtn.onclick = logout;
        document.body.classList.add('is-admin');

        // Sync zone inputs
        const nextInput = document.getElementById('zone-next-count');
        const playoffInput = document.getElementById('zone-playoff-count');
        const outInput = document.getElementById('zone-out-count');
        if (nextInput) nextInput.value = zones.next;
        if (playoffInput) playoffInput.value = zones.playoff;
        if (outInput) outInput.value = zones.out;
    } else {
        if (adminPanel) adminPanel.style.display = 'none';
        if (joinSection) joinSection.style.display = 'block';
        loginBtn.textContent = 'ADMIN LOGIN';
        loginBtn.onclick = () => openModal('admin-login-modal');
        document.body.classList.remove('is-admin');
    }
    renderStandings();
    renderSchedule();
    renderMatchHistory();
}

// --- Team Management ---
async function addTeam() {
    if (!isAdmin) return;
    const nameInput = document.getElementById('new-team-name');
    const name = nameInput.value.trim();
    if (!name) return;

    if (teams.find(t => t.name === name)) {
        alert("Team already exists");
        return;
    }

    const newTeam = {
        name: name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
    };

    if (!supabaseClient) {
        alert("Database not connected. Please check your Supabase keys in app.js.");
        return;
    }
    const { error } = await supabaseClient.from('teams').insert([newTeam]);
    if (error) {
        alert("Error adding team: " + error.message);
        return;
    }

    nameInput.value = '';
    await loadInitialData();
}

async function removeTeam(teamName) {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to remove ${teamName}?`)) return;

    if (!supabaseClient) {
        alert("Database not connected.");
        return;
    }
    const { error } = await supabaseClient.from('teams').delete().eq('name', teamName);
    if (error) {
        alert("Error removing team: " + error.message);
        return;
    }

    await loadInitialData();
}

async function renameTeam(oldName) {
    if (!isAdmin) return;
    const newName = prompt("Enter new team name:", oldName);
    if (!newName || newName === oldName) return;

    if (!supabaseClient) {
        alert("Database not connected.");
        return;
    }
    const { error } = await supabaseClient.from('teams').update({ name: newName }).eq('name', oldName);
    if (error) {
        alert("Error renaming team: " + error.message);
        return;
    }

    await loadInitialData();
}

// --- Match Management ---
async function scheduleMatch(e) {
    if (!isAdmin) return;
    e.preventDefault();
    const t1 = document.getElementById('match-t1').value;
    const t2 = document.getElementById('match-t2').value;
    const dateTime = document.getElementById('match-datetime').value;

    if (t1 === t2) {
        alert("Cannot play against the same team");
        return;
    }

    if (!supabaseClient) {
        alert("Database not connected.");
        return;
    }
    const { error } = await supabaseClient.from('matches').insert([{
        team1: t1,
        team2: t2,
        dateTime: dateTime,
        played: false,
        score1: 0,
        score2: 0
    }]);

    if (error) {
        alert("Error scheduling match: " + error.message);
        return;
    }

    await loadInitialData();
}

async function recordResult(matchId) {
    if (!isAdmin) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    document.getElementById('result-match-id').value = matchId;
    document.getElementById('result-team1-label').textContent = match.team1;
    document.getElementById('result-team2-label').textContent = match.team2;
    document.getElementById('result-score1').value = match.score1;
    document.getElementById('result-score2').value = match.score2;
    document.getElementById('result-highlights').value = match.highlightsUrl || '';

    openModal('result-modal');
}

async function saveMatchResult(e) {
    e.preventDefault();
    if (!isAdmin || !supabaseClient) return;

    const matchId = parseInt(document.getElementById('result-match-id').value);
    const s1 = parseInt(document.getElementById('result-score1').value);
    const s2 = parseInt(document.getElementById('result-score2').value);
    const highlights = document.getElementById('result-highlights').value;

    const { error } = await supabaseClient.from('matches').update({
        score1: s1,
        score2: s2,
        highlightsUrl: highlights,
        played: true
    }).eq('id', matchId);

    if (error) {
        alert("Error saving result: " + error.message);
        return;
    }

    // --- Automated Prediction Scoring ---
    const matchPredictions = predictionsGroup.filter(p => p.matchId === matchId);
    for (const pred of matchPredictions) {
        let pts = 0;
        // Exact score = 3
        if (pred.score1 === s1 && pred.score2 === s2) {
            pts = 3;
        }
        // Correct winner/draw = 1
        else {
            const predWinner = pred.score1 > pred.score2 ? 1 : (pred.score1 < pred.score2 ? 2 : 0);
            const realWinner = s1 > s2 ? 1 : (s1 < s2 ? 2 : 0);
            if (predWinner === realWinner) pts = 1;
        }

        if (pts > 0) {
            await supabaseClient.from('predictions').update({ points: pts }).eq('id', pred.id);
        }
    }

    closeModal('result-modal');
    alert("Result and points updated!");
    await recalculateAndSyncStandings();
}

async function deleteMatch(matchId) {
    if (!isAdmin) return;
    if (!confirm("Delete this match?")) return;

    if (!supabaseClient) {
        alert("Database not connected.");
        return;
    }
    const { error } = await supabaseClient.from('matches').delete().eq('id', matchId);
    if (error) {
        alert("Error deleting match: " + error.message);
        return;
    }

    await recalculateAndSyncStandings();
}

// --- Core Logic ---
async function recalculateAndSyncStandings() {
    if (!supabaseClient) return;
    // Reset all team stats locally first
    const updatedTeams = teams.map(t => ({
        ...t,
        played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0
    }));

    // Fetch latest matches to be sure and UPDATE global matches array
    const { data: currentMatches } = await supabaseClient.from('matches').select('*');
    if (currentMatches) {
        matches = currentMatches; // Fix: Ensure global state has the new highlightsUrl
    }

    matches.filter(m => m.played).forEach(m => {
        const t1 = updatedTeams.find(t => t.name === m.team1);
        const t2 = updatedTeams.find(t => t.name === m.team2);

        if (!t1 || !t2) return;

        t1.played++;
        t2.played++;
        t1.gf += m.score1;
        t1.ga += m.score2;
        t2.gf += m.score2;
        t2.ga += m.score1;

        if (m.score1 > m.score2) {
            t1.wins++;
            t1.pts += 3;
            t2.losses++;
        } else if (m.score1 < m.score2) {
            t2.wins++;
            t2.pts += 3;
            t1.losses++;
        } else {
            t1.draws++;
            t2.draws++;
            t1.pts += 1;
            t2.pts += 1;
        }
    });

    updatedTeams.forEach(t => t.gd = t.gf - t.ga);

    // Update all teams in Supabase
    for (const team of updatedTeams) {
        await supabaseClient.from('teams').update({
            played: team.played,
            wins: team.wins,
            draws: team.draws,
            losses: team.losses,
            gf: team.gf,
            ga: team.ga,
            gd: team.gd,
            pts: team.pts
        }).eq('id', team.id);
    }

    await loadInitialData();
}

// --- Rendering ---
function getTeamForm(teamName) {
    const teamMatches = matches
        .filter(m => m.played && (m.team1 === teamName || m.team2 === teamName))
        .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)) // Newest first
        .slice(0, 5)
        .reverse(); // Display oldest to newest (left to right)

    return teamMatches.map(m => {
        if (m.score1 === m.score2) return { label: 'D', class: 'draw' };
        const isTeam1 = m.team1 === teamName;
        const won = isTeam1 ? m.score1 > m.score2 : m.score2 > m.score1;
        return won ? { label: 'W', class: 'win' } : { label: 'L', class: 'loss' };
    });
}

function renderStandings() {
    if (!standingsBody) return;
    standingsBody.innerHTML = '';

    const zoneNext = zones.next;
    const zonePlayoff = zones.playoff;
    const totalTeams = teams.length;
    const zoneOut = zones.out;

    teams.forEach((t, index) => {
        let zoneClass = '';
        let label = '';
        const rank = index + 1;

        if (rank <= zoneNext) {
            zoneClass = 'zone-next';
            label = '<span class="zone-label label-next">THROUGH</span>';
        } else if (rank <= (zoneNext + zonePlayoff)) {
            zoneClass = 'zone-playoff';
            label = '<span class="zone-label label-playoff">PLAYOFFS</span>';
        } else if (rank > (totalTeams - zoneOut)) {
            zoneClass = 'zone-out';
            label = '<span class="zone-label label-out">ELIMINATED</span>';
        }

        const row = document.createElement('tr');
        row.className = zoneClass;
        row.innerHTML = `
            <td class="rank">${rank}</td>
            <td class="team-name">
                ${t.name} ${label}
                ${isAdmin ? `
                    <div class="admin-controls">
                        <button class="btn-sm btn-danger" onclick="removeTeam('${t.name}')">DEL</button>
                        <button class="btn-sm" onclick="renameTeam('${t.name}')">EDIT</button>
                    </div>
                ` : ''}
            </td>
            <td>${t.played}</td>
            <td>${t.wins}</td>
            <td>${t.draws}</td>
            <td>${t.losses}</td>
            <td>${t.gd > 0 ? '+' : ''}${t.gd}</td>
            <td>
                <div class="form-container">
                    ${getTeamForm(t.name).map(res => `<span class="form-dot ${res.class}">${res.label}</span>`).join('')}
                </div>
            </td>
            <td class="pts">${t.pts}</td>
        `;
        standingsBody.appendChild(row);
    });
}

function renderSchedule() {
    if (!scheduleList || !resultsList) return;
    scheduleList.innerHTML = '';
    resultsList.innerHTML = '';

    // 1. Render Unplayed Matches (Match Schedule)
    const unplayedMatches = matches.filter(m => !m.played);
    const sortedUnplayed = unplayedMatches.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    sortedUnplayed.forEach(m => {
        const card = document.createElement('div');
        card.className = 'glass-card match-card';
        const dateStr = new Date(m.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

        card.innerHTML = `
            <div class="match-info">
                <strong>${dateStr}</strong><br>
                <span style="color:var(--text-dim)">SCHEDULED</span><br>
                <button class="btn-predict" onclick="openPredictionModal(${m.id})">PREDICT</button>
            </div>
            <div class="match-teams">
                <span>${m.team1}</span>
                <span class="vs">VS</span>
                <span>${m.team2}</span>
            </div>
            ${isAdmin ? `
                <div class="admin-controls">
                    <button class="btn-sm btn-success" onclick="recordResult(${m.id})">RESULT</button>
                    <button class="btn-sm btn-danger" onclick="deleteMatch(${m.id})">DEL</button>
                </div>
            ` : ''}
        `;
        scheduleList.appendChild(card);
    });

    // 2. Render Played Matches (Latest Results)
    const playedMatches = matches.filter(m => m.played);
    const sortedPlayed = playedMatches.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); // Newest first

    if (sortedPlayed.length === 0) {
        resultsList.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:1rem;">No results recorded yet.</p>';
    } else {
        sortedPlayed.slice(0, 5).forEach(m => { // Show last 5 results on home page
            const card = document.createElement('div');
            card.className = 'glass-card match-card';
            card.style.borderLeft = '4px solid var(--az-green)';
            const dateStr = new Date(m.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

            card.innerHTML = `
                <div class="match-info">
                    <strong>${dateStr}</strong><br>
                    <span style="color:var(--primary)">COMPLETED</span><br>
                    ${m.highlightsUrl ?
                    `<a href="${m.highlightsUrl}" target="_blank" class="btn-watch"><i data-lucide="play-circle"></i> WATCH HIGHLIGHTS</a>` :
                    `<span style="color:var(--text-dim); font-size: 0.75rem;">No highlights yet</span>`
                }
                </div>
                <div class="match-teams">
                    <span>${m.team1}</span>
                    <span class="vs">${m.score1} - ${m.score2}</span>
                    <span>${m.team2}</span>
                </div>
                ${isAdmin ? `
                    <div class="admin-controls">
                        <button class="btn-sm btn-success" onclick="recordResult(${m.id})">EDIT HIGHLIGHTS</button>
                        <button class="btn-sm btn-danger" onclick="deleteMatch(${m.id})">DEL</button>
                    </div>
                ` : ''}
            `;
            resultsList.appendChild(card);
        });
    }
    lucide.createIcons();
}

function openPredictionModal(matchId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    document.getElementById('predict-match-id').value = matchId;
    document.getElementById('predict-team1-label').textContent = `${match.team1} Score`;
    document.getElementById('predict-team2-label').textContent = `${match.team2} Score`;
    openModal('prediction-modal');
}

async function submitPrediction(e) {
    e.preventDefault();
    if (!supabaseClient) return;

    const matchId = parseInt(document.getElementById('predict-match-id').value);
    const userName = document.getElementById('predict-user-name').value;
    const score1 = parseInt(document.getElementById('predict-score1').value);
    const score2 = parseInt(document.getElementById('predict-score2').value);

    const { error } = await supabaseClient.from('predictions').insert([{
        matchId, userName, score1, score2
    }]);

    if (error) {
        alert("Error submitting prediction: " + error.message);
        return;
    }

    alert("Prediction submitted! Good luck!");
    closeModal('prediction-modal');
    e.target.reset();
    await loadInitialData();
}

function renderMatchHistory() {
    const historyContainer = document.getElementById('admin-match-history');
    if (!historyContainer) return;
    historyContainer.innerHTML = '';

    const playedMatches = matches.filter(m => m.played);
    const sortedMatches = playedMatches.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); // Newest first

    if (sortedMatches.length === 0) {
        historyContainer.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:1rem;">No completed matches yet.</p>';
        return;
    }

    sortedMatches.forEach(m => {
        const card = document.createElement('div');
        card.className = 'glass-card match-card';
        card.style.borderLeftColor = 'var(--az-green)';

        const dateStr = new Date(m.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

        card.innerHTML = `
            <div class="match-info">
                <strong>${dateStr}</strong><br>
                <span style="color:var(--primary)">COMPLETED</span><br>
                ${m.highlightsUrl ? `<a href="${m.highlightsUrl}" target="_blank" class="btn-watch"><i data-lucide="play-circle"></i> WATCH</a>` : ''}
            </div>
            <div class="match-teams">
                <span>${m.team1}</span>
                <span class="vs">${m.score1} - ${m.score2}</span>
                <span>${m.team2}</span>
            </div>
            ${isAdmin ? `
            <div class="admin-controls">
                <button class="btn-sm btn-success" onclick="recordResult(${m.id})">EDIT SCORE</button>
                <button class="btn-sm btn-danger" onclick="deleteMatch(${m.id})">DEL</button>
            </div>
            ` : ''}
        `;
        historyContainer.appendChild(card);
    });
    // Refresh icons since we injected some
    lucide.createIcons();
}

function calculateLeaderboard() {
    const scores = {};
    predictionsGroup.forEach(p => {
        if (!scores[p.userName]) scores[p.userName] = 0;
        scores[p.userName] += p.points || 0;
    });

    leaderboard = Object.entries(scores)
        .map(([name, pts]) => ({ name, pts }))
        .sort((a, b) => b.pts - a.pts);

    renderLeaderboard();
}

function renderLeaderboard() {
    const body = document.getElementById('leaderboard-body');
    if (!body) return;
    body.innerHTML = '';

    leaderboard.forEach((user, index) => {
        const row = `
            <tr>
                <td>#${index + 1}</td>
                <td>${user.name}</td>
                <td><strong>${user.pts}</strong> pts</td>
            </tr>
        `;
        body.innerHTML += row;
    });
}

function populateSelects() {
    const s1 = document.getElementById('match-t1');
    const s2 = document.getElementById('match-t2');
    if (!s1 || !s2) return;

    s1.innerHTML = '<option value="">Select Team 1</option>';
    s2.innerHTML = '<option value="">Select Team 2</option>';

    teams.forEach(t => {
        const opt = `<option value="${t.name}">${t.name}</option>`;
        s1.innerHTML += opt;
        s2.innerHTML += opt;
    });
}

// --- Utils ---
async function updateZones() {
    if (!isAdmin) return;
    const newZones = {
        next: parseInt(document.getElementById('zone-next-count').value) || 0,
        playoff: parseInt(document.getElementById('zone-playoff-count').value) || 0,
        out: parseInt(document.getElementById('zone-out-count').value) || 0
    };

    if (!supabaseClient) {
        alert("Database not connected.");
        return;
    }
    // Upsert zones (assuming single row with id 1)
    const { error } = await supabaseClient.from('zones').upsert([{ id: 1, ...newZones }]);
    if (error) {
        alert("Error updating zones: " + error.message);
        return;
    }

    zones = newZones;
    renderStandings();
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// --- Drag and Drop File Upload ---
function initDragAndDrop() {
    const dropZone = document.getElementById('highlights-drop-zone');
    const fileInput = document.getElementById('highlights-file-input');

    if (!dropZone || !fileInput) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files), false);
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

async function handleFiles(files) {
    if (files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith('video/')) {
        alert("Please upload a video file.");
        return;
    }

    if (!supabaseClient) {
        alert("Database not connected. Cannot upload.");
        return;
    }

    const dropZone = document.getElementById('highlights-drop-zone');
    const statusDiv = document.getElementById('upload-status');
    const urlInput = document.getElementById('result-highlights');

    statusDiv.style.display = 'block';
    statusDiv.innerHTML = 'Uploading: <span id="upload-percent">Please wait...</span>';
    dropZone.style.pointerEvents = 'none';

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `public/${fileName}`;

        const { data, error } = await supabaseClient.storage
            .from('highlights')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            throw error;
        }

        const { data: publicUrlData } = supabaseClient.storage
            .from('highlights')
            .getPublicUrl(filePath);

        urlInput.value = publicUrlData.publicUrl;

        dropZone.classList.add('success');
        statusDiv.innerHTML = '<span style="color: var(--primary)">Upload Complete! URL saved to input.</span>';

    } catch (err) {
        console.error("Upload error:", err);
        alert("Error uploading file: " + err.message);
        statusDiv.style.display = 'none';
    } finally {
        dropZone.style.pointerEvents = 'auto';
    }
}

document.addEventListener('DOMContentLoaded', initDragAndDrop);
