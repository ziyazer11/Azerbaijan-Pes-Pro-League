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
    translatePage(); // Translate static elements first
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
        alert(t('alert_error_generic') + error.message);
        return;
    }
    tickerText = text;
    updateTickerUI();
    input.value = '';
    alert(t('alert_news_updated'));
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
        alert(t('alert_login_success'));
    } else {
        alert(t('alert_login_fail'));
    }
}

function loginBtnClick() {
    if (isAdmin) {
        logout();
    } else {
        openModal('admin-login-modal');
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
        alert(t('alert_team_exists'));
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
        alert(t('alert_no_db_full'));
        return;
    }
    const { error } = await supabaseClient.from('teams').insert([newTeam]);
    if (error) {
        alert(t('alert_error_generic') + error.message);
        return;
    }

    nameInput.value = '';
    await loadInitialData();
}

async function removeTeam(teamName) {
    if (!isAdmin) return;
    if (!confirm(t('alert_del_team_confirm') + ` ${teamName}?`)) return;

    if (!supabaseClient) {
        alert(t('alert_no_db'));
        return;
    }
    const { error } = await supabaseClient.from('teams').delete().eq('name', teamName);
    if (error) {
        alert(t('alert_error_generic') + error.message);
        return;
    }

    await loadInitialData();
}

async function renameTeam(oldName) {
    if (!isAdmin) return;
    const newName = prompt(t('prompt_new_team_name'), oldName);
    if (!newName || newName === oldName) return;

    if (!supabaseClient) {
        alert(t('alert_no_db'));
        return;
    }
    const { error } = await supabaseClient.from('teams').update({ name: newName }).eq('name', oldName);
    if (error) {
        alert(t('alert_error_generic') + error.message);
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
        alert(t('alert_same_team'));
        return;
    }

    if (!supabaseClient) {
        alert(t('alert_no_db'));
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
        alert(t('alert_error_generic') + error.message);
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
            label = `<span class="zone-label label-next">${t('zone_through')}</span>`;
        } else if (rank <= (zoneNext + zonePlayoff)) {
            zoneClass = 'zone-playoff';
            label = `<span class="zone-label label-playoff">${t('zone_playoffs')}</span>`;
        } else if (rank > (totalTeams - zoneOut)) {
            zoneClass = 'zone-out';
            label = `<span class="zone-label label-out">${t('zone_eliminated')}</span>`;
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
                <span style="color:var(--text-dim)">${t('scheduled')}</span><br>
                <button class="btn-predict" onclick="openPredictionModal(${m.id})">${t('predict')}</button>
            </div>
            <div class="match-teams">
                <span>${m.team1}</span>
                <span class="vs">VS</span>
                <span>${m.team2}</span>
            </div>
            ${isAdmin ? `
                <div class="admin-controls">
                    <button class="btn-sm btn-success" onclick="recordResult(${m.id})">${t('edit_score')}</button>
                    <button class="btn-sm btn-danger" onclick="deleteMatch(${m.id})">${t('del')}</button>
                </div>
            ` : ''}
        `;
        scheduleList.appendChild(card);
    });

    // 2. Render Played Matches (Latest Results)
    const playedMatches = matches.filter(m => m.played);
    const sortedPlayed = playedMatches.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)); // Newest first

    if (sortedPlayed.length === 0) {
        resultsList.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding:1rem;">${t('no_results')}</p>`;
    } else {
        sortedPlayed.slice(0, 5).forEach(m => { // Show last 5 results on home page
            const card = document.createElement('div');
            card.className = 'glass-card match-card';
            card.style.borderLeft = '4px solid var(--az-green)';
            const dateStr = new Date(m.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

            card.innerHTML = `
                <div class="match-info">
                    <strong>${dateStr}</strong><br>
                    <span style="color:var(--primary)">${t('completed')}</span><br>
                    ${m.highlightsUrl ?
                    `<a href="${m.highlightsUrl}" target="_blank" class="btn-watch"><i data-lucide="play-circle"></i> ${t('watch_highlights')}</a>` :
                    `<span style="color:var(--text-dim); font-size: 0.75rem;">${t('no_highlights')}</span>`
                }
                </div>
                <div class="match-teams">
                    <span>${m.team1}</span>
                    <span class="vs">${m.score1} - ${m.score2}</span>
                    <span>${m.team2}</span>
                </div>
                ${isAdmin ? `
                    <div class="admin-controls">
                        <button class="btn-sm btn-success" onclick="recordResult(${m.id})">${t('edit_highlights')}</button>
                        <button class="btn-sm btn-danger" onclick="deleteMatch(${m.id})">${t('del')}</button>
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
        alert(t('alert_pred_error') + error.message);
        return;
    }

    alert(t('alert_pred_success'));
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
        historyContainer.innerHTML = `<p style="color:var(--text-dim); text-align:center; padding:1rem;">${t('no_completed')}</p>`;
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
                <span style="color:var(--primary)">${t('completed')}</span><br>
                ${m.highlightsUrl ? `<a href="${m.highlightsUrl}" target="_blank" class="btn-watch"><i data-lucide="play-circle"></i> ${t('watch')}</a>` : ''}
            </div>
            <div class="match-teams">
                <span>${m.team1}</span>
                <span class="vs">${m.score1} - ${m.score2}</span>
                <span>${m.team2}</span>
            </div>
            ${isAdmin ? `
            <div class="admin-controls">
                <button class="btn-sm btn-success" onclick="recordResult(${m.id})">${t('edit_score')}</button>
                <button class="btn-sm btn-danger" onclick="deleteMatch(${m.id})">${t('del')}</button>
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
        alert(t('alert_no_db'));
        return;
    }
    // Upsert zones (assuming single row with id 1)
    const { error } = await supabaseClient.from('zones').upsert([{ id: 1, ...newZones }]);
    if (error) {
        alert(t('alert_error_generic') + error.message);
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
        alert(t('alert_upload_type'));
        return;
    }

    if (!supabaseClient) {
        alert(t('alert_no_db'));
        return;
    }

    const dropZone = document.getElementById('highlights-drop-zone');
    const statusDiv = document.getElementById('upload-status');
    const urlInput = document.getElementById('result-highlights');

    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `${t('uploading')}: <span id="upload-percent">${t('please_wait')}</span>`;
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
        statusDiv.innerHTML = `<span style="color: var(--primary)">${t('upload_complete')}</span>`;

    } catch (err) {
        console.error("Upload error:", err);
        alert(t('alert_error_generic') + err.message);
        statusDiv.style.display = 'none';
    } finally {
        dropZone.style.pointerEvents = 'auto';
    }
}

document.addEventListener('DOMContentLoaded', initDragAndDrop);

// --- i18n Translation Dictionary ---
let currentLang = localStorage.getItem('pesLeagueLang') || 'en';

const i18n = {
    "en": {
        "scheduled": "SCHEDULED",
        "completed": "COMPLETED",
        "watch_highlights": "WATCH HIGHLIGHTS",
        "watch": "WATCH",
        "predict": "PREDICT",
        "edit_score": "RESULT",
        "edit_highlights": "EDIT HIGHLIGHTS",
        "del": "DEL",
        "no_results": "No results recorded yet.",
        "no_completed": "No completed matches yet.",
        "no_highlights": "No highlights yet",
        "next_match": "NEXT MATCH IN",
        "leaderboard": "LEADERBOARD",
        "history": "HISTORY",
        "admin_login": "ADMIN LOGIN",
        "logout": "LOGOUT",
        "premier_league": "PREMIER LEAGUE",
        "hero_desc": "The elite competition for PES players around the world. Register now and prove your skills on the pitch.",
        "league_standings": "LEAGUE STANDINGS",
        "latest_results": "LATEST RESULTS",
        "match_schedule": "MATCH SCHEDULE",
        "team": "TEAM",
        "form": "FORM",
        "pts": "PTS",
        "secure_access": "SECURE ACCESS",
        "email_address": "Email Address",
        "password": "Password",
        "authenticate": "AUTHENTICATE",
        "record_result": "RECORD RESULT",
        "upload_highlights_url": "UPLOAD HIGHLIGHTS URL (YouTube/Twitch/etc)",
        "or_upload_video": "OR UPLOAD VIDEO HIGHLIGHTS",
        "drag_drop": "Drag & Drop MP4 file or click to browse",
        "save_result": "SAVE RESULT",
        "match_history": "MATCH HISTORY",
        "prediction_leaderboard": "PREDICTION LEADERBOARD",
        "rank": "RANK",
        "user": "USER",
        "points": "POINTS",
        "predict_score": "PREDICT SCORE",
        "your_name": "Your Name",
        "submit_prediction": "SUBMIT PREDICTION",
        "join_competition": "JOIN THE COMPETITION",
        "email_us": "EMAIL US",
        "call_us": "CALL US",
        "click_to_join": "CLICK HERE TO JOIN COMPETITION",
        // Admin Panel & Placeholders
        "admin_cp": "ADMIN CONTROL PANEL",
        "manage_teams": "MANAGE TEAMS",
        "enter_team_name": "Enter Team Name",
        "add_team": "ADD TEAM",
        "tournament_zones": "TOURNAMENT ZONES",
        "zone_desc": "Set how many teams go through to each stage (from top to bottom).",
        "next_round": "Next Round (Top X)",
        "playoffs": "Playoffs (Next X)",
        "out_zone": "Out (Bottom X)",
        "news_bar": "NEWS BAR",
        "news_desc": "Update the scrolling news ticker at the top of the site.",
        "enter_news": "Enter latest news...",
        "update": "UPDATE",
        "schedule_new_match": "SCHEDULE NEW MATCH",
        "team_1": "Team 1",
        "team_2": "Team 2",
        "date_time": "Date & Time",
        "create": "CREATE",
        "loading_news": "Loading latest news...",
        "enter_display_name": "Enter your display name",
        "enter_highlights_url": "https://youtube.com/...",
        // Alerts
        "alert_provide_score": "Please provide both scores.",
        "alert_provide_highlight": "Please provide either a YouTube/Twitch URL or upload a video file.",
        "alert_highlight_uploading": "Please wait for the video upload to complete.",
        "alert_pred_error": "Error submitting prediction: ",
        "alert_pred_success": "Prediction submitted! Good luck!",
        "alert_del_confirm": "Are you sure you want to delete this match?",
        "alert_del_team_confirm": "Are you sure you want to remove",
        "alert_fill_team_date": "Please fill all fields: Team 1, Team 2, and Date.",
        "alert_same_team": "Team 1 and Team 2 cannot be the same.",
        "alert_fill_team_name": "Please enter a team name.",
        "alert_team_exists": "Team already exists!",
        "alert_no_db": "Database not connected.",
        "alert_no_db_full": "Database not connected. Please check your Supabase keys in app.js.",
        "alert_error_generic": "Error: ",
        "alert_news_updated": "Official News Updated!",
        "alert_login_success": "Logged in as Admin",
        "alert_login_fail": "Invalid credentials",
        "prompt_new_team_name": "Enter new team name:",
        "alert_upload_type": "Please upload a video file.",
        "uploading": "Uploading",
        "please_wait": "Please wait...",
        "upload_complete": "Upload Complete! URL saved to input.",
        "zone_through": "THROUGH",
        "zone_playoffs": "PLAYOFFS",
        "zone_eliminated": "ELIMINATED"
    },
    "az": {
        "scheduled": "PLANLAŞDIRILIB",
        "completed": "TAMAMLANIB",
        "watch_highlights": "İCMAL QİSMİNƏ BAX",
        "watch": "BAX",
        "predict": "TƏXMİN ET",
        "edit_score": "NƏTİCƏ",
        "edit_highlights": "İCMALI YENİLƏ",
        "del": "SİL",
        "no_results": "Hələ nəticə yoxdur.",
        "no_completed": "Hələ tamamlanmış oyun yoxdur.",
        "no_highlights": "Hələ icmal yoxdur",
        "next_match": "NÖVBƏTİ OYUN",
        "leaderboard": "LİDERLƏR CƏDVƏLİ",
        "history": "TARİXÇƏ",
        "admin_login": "ADMİN GİRİŞİ",
        "logout": "ÇIXIŞ",
        "premier_league": "PREMYER LİQA",
        "hero_desc": "Bütün dünyadakı PES oyunçuları üçün elit yarışma. İndi qeydiyyatdan keçin və meydanda bacarıqlarınızı sübut edin.",
        "league_standings": "LİQA CƏDVƏLİ",
        "latest_results": "SON NƏTİCƏLƏR",
        "match_schedule": "OYUN TƏQVİMİ",
        "team": "KOMANDA",
        "form": "FORMA",
        "pts": "XAL",
        "secure_access": "TƏHLÜKƏSİZ GİRİŞ",
        "email_address": "E-poçt Ünvanı",
        "password": "Şifrə",
        "authenticate": "TƏSDİQLƏ",
        "record_result": "NƏTİCƏNİ QEYD ET",
        "upload_highlights_url": "İCMALIN LİNKİNİ YÜKLƏ (YouTube/Twitch/və s)",
        "or_upload_video": "YAXUD VİDEO İCMALI YÜKLƏ",
        "drag_drop": "MP4 faylını bura at və ya seçmək üçün tıkla",
        "save_result": "NƏTİCƏNİ YADDA SAXLA",
        "match_history": "OYUN TARİXÇƏSİ",
        "prediction_leaderboard": "TƏXMİN LİDERLƏR CƏDVƏLİ",
        "rank": "SIYAHI",
        "user": "İSTİFADƏÇİ",
        "points": "XAL",
        "predict_score": "HESABI TƏXMİN ET",
        "your_name": "Adınız",
        "submit_prediction": "TƏXMİNİ GÖNDƏR",
        "join_competition": "YARIŞMAYA QOŞULUN",
        "email_us": "BİZƏ YAZIN",
        "call_us": "BİZƏ ZƏNG EDİN",
        "click_to_join": "YARIŞMAYA QOŞULMAQ ÜÇÜN BURAYA TIKLAYIN",
        // Admin Panel & Placeholders
        "admin_cp": "ADMİN İDARƏETMƏ PANeli",
        "manage_teams": "KOMANDALARI İDARƏ ET",
        "enter_team_name": "Komandanın Adını Daxil Edin",
        "add_team": "KOMANDA ƏLAVƏ ET",
        "tournament_zones": "TURNİR ZONALARI",
        "zone_desc": "Hər mərhələyə neçə komandanın keçəcəyini təyin edin (yuxarıdan aşağıya).",
        "next_round": "Növbəti Mərhələ (İlk X)",
        "playoffs": "Pley-off (Növbəti X)",
        "out_zone": "Məğlub (Son X)",
        "news_bar": "XƏBƏRLƏR BÖLMƏSİ",
        "news_desc": "Saytın yuxarısındakı hərəkətli xəbər zolağını yeniləyin.",
        "enter_news": "Ən son xəbəri daxil edin...",
        "update": "YENİLƏ",
        "schedule_new_match": "YENİ OYUN PLANLAŞDIR",
        "team_1": "Komanda 1",
        "team_2": "Komanda 2",
        "date_time": "Tarix və Saat",
        "create": "YARAT",
        "loading_news": "Ən son xəbərlər yüklənir...",
        "enter_display_name": "Görünəcək adınızı daxil edin",
        "enter_highlights_url": "https://youtube.com/...",
        // Alerts
        "alert_provide_score": "Zəhmət olmasa hər iki hesabı qeyd edin.",
        "alert_provide_highlight": "Zəhmət olmasa ya YouTube/Twitch linki təqdim edin, ya da video faylı yükləyin.",
        "alert_highlight_uploading": "Zəhmət olmasa video yüklənməsinin tamamlanmasını gözləyin.",
        "alert_pred_error": "Təxmin göndərilərkən xəta baş verdi: ",
        "alert_pred_success": "Təxmin göndərildi! Uğurlar!",
        "alert_del_confirm": "Bu oyunu silmək istədiyinizdən əminsiniz?",
        "alert_del_team_confirm": "Adlı komandanı silmək istədiyinizdən əminsiniz:",
        "alert_fill_team_date": "Zəhmət olmasa bütün xanaları doldurun: Komanda 1, Komanda 2 və Tarix.",
        "alert_same_team": "Komanda 1 və Komanda 2 eyni ola bilməz.",
        "alert_fill_team_name": "Zəhmət olmasa komandanın adını daxil edin.",
        "alert_team_exists": "Komanda artıq mövcuddur!",
        "alert_no_db": "Məlumat bazası qoşulmayıb.",
        "alert_no_db_full": "Məlumat bazası qoşulmayıb. Zəhmət olmasa app.js-də Supabase açarlarınızı yoxlayın.",
        "alert_error_generic": "Xəta: ",
        "alert_news_updated": "Rəsmi Xəbərlər Yeniləndi!",
        "alert_login_success": "Admin kimi daxil oldunuz",
        "alert_login_fail": "Email və ya Şifrə yanlışdır",
        "prompt_new_team_name": "Yeni komandanın adını daxil edin:",
        "alert_upload_type": "Zəhmət olmasa video fayl yükləyin.",
        "uploading": "Yüklənir",
        "please_wait": "Zəhmət olmasa gözləyin...",
        "upload_complete": "Yüklənmə Tamamlandı! Link yadda saxlanıldı.",
        "zone_through": "NÖVBƏTİ",
        "zone_playoffs": "PLEY-OFF",
        "zone_eliminated": "MƏĞLUB"
    }
};

function t(key) {
    return i18n[currentLang][key] || key;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('pesLeagueLang', lang);
    translatePage();
}

function translatePage() {
    // Translate static HTML tags and placeholders safely
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = i18n[currentLang] && i18n[currentLang][key];
        if (!translation) return;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            // For inputs, update placeholder only
            if (el.hasAttribute('placeholder')) {
                el.setAttribute('placeholder', translation);
            }
        } else {
            // Safe text-only update: only replace the first TEXT node.
            // This preserves child elements (icons, spans) and event listeners.
            let textNode = null;
            for (let child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
                    textNode = child;
                    break;
                }
            }
            if (textNode) {
                textNode.textContent = translation;
            } else if (el.childNodes.length === 0 || (el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE)) {
                // Only set textContent when there are no child elements to protect
                el.textContent = translation;
            }
        }
    });

    // Translate specific labels that don't have dedicated data-i18n wrappers
    const predictTeam1Label = document.getElementById('predict-team1-label');
    const predictTeam2Label = document.getElementById('predict-team2-label');
    if (predictTeam1Label && predictTeam1Label.textContent.includes('Score')) {
        const team1Name = predictTeam1Label.textContent.replace(' Score', '').replace(' Hesabı', '');
        predictTeam1Label.textContent = currentLang === 'en' ? `${team1Name} Score` : `${team1Name} Hesabı`;
    }
    if (predictTeam2Label && predictTeam2Label.textContent.includes('Score')) {
        const team2Name = predictTeam2Label.textContent.replace(' Score', '').replace(' Hesabı', '');
        predictTeam2Label.textContent = currentLang === 'en' ? `${team2Name} Score` : `${team2Name} Hesabı`;
    }

    // Translate dynamic prediction result texts
    const resultTeam1Label = document.getElementById('result-team1-label');
    const resultTeam2Label = document.getElementById('result-team2-label');
    if (resultTeam1Label && resultTeam1Label.textContent === 'Team 1') {
        resultTeam1Label.textContent = t('team_1');
    }
    if (resultTeam2Label && resultTeam2Label.textContent === 'Team 2') {
        resultTeam2Label.textContent = t('team_2');
    }


    // Re-render dynamic elements to apply new language
    renderStandings();
    renderSchedule();
    renderMatchHistory();

    // Toggle active state on language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        if (btn.textContent.trim().toLowerCase() === currentLang) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
