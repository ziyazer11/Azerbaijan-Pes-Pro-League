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
let userTimezone = localStorage.getItem('pesLeagueTimezone') || 'Asia/Baku'; // Default timezone
let trashTalkPosts = []; // All trash talk posts

// Credentials
const ADMIN_EMAIL = "ziyazer11@gmail.com";
const ADMIN_PASS = "Hasanzade2011!";

// DOM Elements (populated after DOM is ready)
let standingsBody, scheduleList, resultsList;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DOM refs now that DOM is ready
    standingsBody = document.getElementById('standings-body');
    scheduleList = document.getElementById('schedule-list');
    resultsList = document.getElementById('results-list');

    translatePage(); // Translate static elements first

    // Set initial timezone select value
    const tzSelect = document.getElementById('user-timezone-select');
    if (tzSelect) tzSelect.value = userTimezone;

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
                tickerText = settingsData.newsText || tickerText;
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

        // Load Trash Talk
        try {
            const { data: ttData, error: ttErr } = await supabaseClient
                .from('trash_talk')
                .select('*')
                .order('votes', { ascending: false })
                .order('created_at', { ascending: false });
            if (ttData && !ttErr) {
                trashTalkPosts = ttData;
            }
        } catch (e) {
            console.warn("Trash talk table not found or inaccessible.");
        }

        renderStandings();
        renderSchedule();
        renderMatchHistory();
        renderKnockoutBracket();
        renderTrashTalk();
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

async function toggleLiveMatch(matchId, isCurrentlyLive) {
    if (!isAdmin || !supabaseClient) return;

    // Set all other matches to not live first if going live
    if (!isCurrentlyLive) {
        await supabaseClient.from('matches').update({ is_live: false }).neq('id', matchId);
    }

    // Toggle the target match
    const updateData = { is_live: !isCurrentlyLive };

    // If going live, init scores to 0 if null
    if (!isCurrentlyLive) {
        const targetMatch = matches.find(m => m.id === matchId);
        if (targetMatch && targetMatch.score1 === null) updateData.score1 = 0;
        if (targetMatch && targetMatch.score2 === null) updateData.score2 = 0;
    }

    const { error } = await supabaseClient.from('matches').update(updateData).eq('id', matchId);
    if (error) {
        alert(t('alert_error_generic') + error.message);
        return;
    }

    await loadInitialData();
}

async function updateLiveScore(id) {
    if (!isAdmin || !supabaseClient) return;
    const match = matches.find(m => m.id === id);
    if (!match) return;

    let s1 = prompt(`Enter live score for ${match.team1}:`, match.score1 || 0);
    if (s1 === null) return;
    let s2 = prompt(`Enter live score for ${match.team2}:`, match.score2 || 0);
    if (s2 === null) return;

    const numS1 = parseInt(s1);
    const numS2 = parseInt(s2);

    if (isNaN(numS1) || isNaN(numS2)) {
        alert(t('alert_invalid_score') || "Invalid score entered.");
        return;
    }

    const { error } = await supabaseClient
        .from('matches')
        .update({ score1: numS1, score2: numS2 })
        .eq('id', id);

    if (error) {
        alert(t('alert_error_generic') + error.message);
        return;
    }

    await loadInitialData();
}

function checkForLiveMatch() {
    const liveMatch = matches.find(m => m.is_live && !m.played);
    const banner = document.getElementById('live-match-banner');
    const bannerText = document.getElementById('live-banner-text');

    if (liveMatch && banner && bannerText) {
        banner.style.display = 'flex';
        bannerText.textContent = `🔴 LIVE NOW: ${liveMatch.team1} vs ${liveMatch.team2} (Week ${liveMatch.week || 1})`;
    } else if (banner) {
        banner.style.display = 'none';
    }
}

// Check for live match roughly every 30 seconds
setInterval(async () => {
    if (supabaseClient) {
        const { data } = await supabaseClient.from('matches').select('id, is_live, team1, team2, played, week');
        if (data) {
            // Merge just the live status into local state quietly
            data.forEach(serverMatch => {
                const localMatch = matches.find(m => m.id === serverMatch.id);
                if (localMatch) {
                    localMatch.is_live = serverMatch.is_live;
                }
            });
            checkForLiveMatch();
            renderSchedule(); // re-render schedule to show/hide pulsing live badge
        }
    }
}, 30000);

async function updateUserTimezone() {
    const select = document.getElementById('user-timezone-select');
    const newTz = select.value;
    if (!newTz) return;

    userTimezone = newTz;
    localStorage.setItem('pesLeagueTimezone', newTz);

    // Re-render UI with new timezone
    renderSchedule();
    renderMatchHistory();
    startCountdownTimer(); // Re-calculates and re-renders countdown
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

        // Sync inputs
        const nextInput = document.getElementById('zone-next-count');
        const playoffInput = document.getElementById('zone-playoff-count');
        const outInput = document.getElementById('zone-out-count');
        const tzSelect = document.getElementById('admin-timezone-select');

        if (nextInput) nextInput.value = zones.next;
        if (playoffInput) playoffInput.value = zones.playoff;
        if (outInput) outInput.value = zones.out;
        if (tzSelect) tzSelect.value = globalTimezone;
    } else {
        if (adminPanel) adminPanel.style.display = 'none';
        if (joinSection) joinSection.style.display = 'block';
        loginBtn.textContent = 'ADMIN LOGIN';
        loginBtn.onclick = () => openModal('admin-login-modal');
        document.body.classList.remove('is-admin');
    }

    checkForLiveMatch();
    renderStandings();
    renderSchedule();
    renderMatchHistory();
    renderWeeklyAwards();
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

    const stageEl = document.getElementById('match-stage');
    // Default to Week 1 if null, handle parsing differently because Knockout Stages are strings (QF, SF, F)
    const weekInput = stageEl ? stageEl.value : '1';

    // Check if it's a number string mapping to a regular week, else keep string (QF, SF, F)
    let weekVal = weekInput;

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
        week: weekVal,
        is_live: false,
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
        played: true,
        is_live: false // Turn off live status when result is saved
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

    teams.forEach((team, index) => {
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
                ${team.name} ${label}
                ${isAdmin ? `
                    <div class="admin-controls">
                        <button class="btn-sm btn-danger" onclick="removeTeam('${team.name}')">DEL</button>
                        <button class="btn-sm" onclick="renameTeam('${team.name}')">EDIT</button>
                    </div>
                ` : ''}
            </td>
            <td>${team.played}</td>
            <td>${team.wins}</td>
            <td>${team.draws}</td>
            <td>${team.losses}</td>
            <td>${team.gd > 0 ? '+' : ''}${team.gd}</td>
            <td>
                <div class="form-container">
                    ${getTeamForm(team.name).map(res => `<span class="form-dot ${res.class}">${res.label}</span>`).join('')}
                </div>
            </td>
            <td class="pts">${team.pts}</td>
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

        // Format with timezone
        const dateObj = new Date(m.dateTime);
        const dateStr = new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: userTimezone
        }).format(dateObj);

        const liveBadgeHTML = m.is_live ? `<div class="live-badge">🔴 LIVE</div>` : `<strong>${dateStr}</strong>`;

        let scoreDisplay = 'VS';
        if (m.is_live && m.score1 !== null && m.score2 !== null) {
            scoreDisplay = `<span style="color:var(--accent); font-weight:800;">${m.score1} - ${m.score2}</span>`;
        }

        card.innerHTML = `
            <div class="match-info">
                ${liveBadgeHTML}<br>
                <span style="color:var(--text-dim)">${t('scheduled')} - Week ${m.week || 1}</span><br>
                <button class="btn-predict" onclick="openPredictionModal(${m.id})">${t('predict')}</button>
            </div>
            <div class="match-teams">
                <span>${m.team1}</span>
                <span class="vs">${scoreDisplay}</span>
                <span>${m.team2}</span>
            </div>
            ${isAdmin ? `
                <div class="admin-controls">
                    <button class="btn-sm ${m.is_live ? 'btn-danger' : 'btn-primary'}" onclick="toggleLiveMatch(${m.id}, ${m.is_live})">${m.is_live ? 'END LIVE' : 'GO LIVE'}</button>
                    ${m.is_live ? `<button class="btn-sm btn-warn" onclick="updateLiveScore(${m.id})">UP. SCORE</button>` : ''}
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

            // Format with timezone
            const dateObj = new Date(m.dateTime);
            const dateStr = new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: userTimezone
            }).format(dateObj);

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

        // Format with timezone
        const dateObj = new Date(m.dateTime);
        const dateStr = new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: userTimezone
        }).format(dateObj);

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
    renderWeeklyAwards(); // Update awards when history changes
    renderKnockoutBracket(); // Re-render bracket
}

function renderKnockoutBracket() {
    const container = document.getElementById('knockout-stage');
    const bracket = document.getElementById('knockout-bracket');
    if (!container || !bracket) return;

    // Filter matches that belong to knockout stages
    const qfMatches = matches.filter(m => m.week === 'QF');
    const sfMatches = matches.filter(m => m.week === 'SF');
    const fMatches = matches.filter(m => m.week === 'F');

    // If no knockout matches exist, hide the section entirely
    if (qfMatches.length === 0 && sfMatches.length === 0 && fMatches.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Helper to render a match block
    const renderNode = (m) => {
        if (!m) {
            return `<div class="bracket-match empty"><div class="bracket-team">TBD</div><div class="bracket-team">TBD</div></div>`;
        }

        const s1 = m.score1 !== null ? m.score1 : '-';
        const s2 = m.score2 !== null ? m.score2 : '-';
        const isLive = m.is_live ? '<span class="live-dot" style="position:static; width:6px; height:6px; margin-right:4px;"></span>' : '';

        return `
            <div class="bracket-match ${m.played ? 'played' : (m.is_live ? 'live' : '')}">
                <div class="bracket-team ${m.played && m.score1 > m.score2 ? 'winner' : ''}">
                    <span>${m.team1}</span>
                    <span class="bracket-score">${s1}</span>
                </div>
                <div class="bracket-team ${m.played && m.score2 > m.score1 ? 'winner' : ''}">
                    <span>${isLive}${m.team2}</span>
                    <span class="bracket-score">${s2}</span>
                </div>
            </div>
        `;
    };

    // Construct Columns
    let html = '';

    // Quarter Finals Column
    if (qfMatches.length > 0 || sfMatches.length > 0 || fMatches.length > 0) {
        html += `<div class="bracket-column">
            <h4 style="color:var(--text-dim); text-align:center; margin-bottom:1rem;" data-i18n="quarter_finals">${t('quarter_finals') || 'Quarter Finals'}</h4>
            ${renderNode(qfMatches[0])}
            ${renderNode(qfMatches[1])}
            ${renderNode(qfMatches[2])}
            ${renderNode(qfMatches[3])}
        </div>`;
    }

    // Semi Finals Column
    if (sfMatches.length > 0 || fMatches.length > 0) {
        html += `<div class="bracket-column">
            <h4 style="color:var(--text-dim); text-align:center; margin-bottom:1rem;" data-i18n="semi_finals">${t('semi_finals') || 'Semi Finals'}</h4>
            <div class="sf-connector">
                ${renderNode(sfMatches[0])}
            </div>
            <div class="sf-connector">
                ${renderNode(sfMatches[1])}
            </div>
        </div>`;
    }

    // Final Column
    if (fMatches.length > 0) {
        html += `<div class="bracket-column">
            <h4 style="color:gold; text-align:center; margin-bottom:1rem;" data-i18n="final">${t('final') || 'Final'}</h4>
            <div class="f-connector">
                ${renderNode(fMatches[0])}
            </div>
        </div>`;
    }

    bracket.innerHTML = html;
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

function renderWeeklyAwards() {
    const container = document.getElementById('awards-container');
    if (!container) return;

    // Get latest week from played matches
    const playedMatches = matches.filter(m => m.played);
    if (playedMatches.length === 0) {
        container.innerHTML = `<p style="color:var(--text-dim); text-align:center;">${t('no_awards_yet')}</p>`;
        return;
    }

    const latestWeek = Math.max(...playedMatches.map(m => parseInt(m.week) || 1));
    const thisWeekMatches = playedMatches.filter(m => (parseInt(m.week) || 1) === latestWeek);

    if (thisWeekMatches.length === 0) {
        container.innerHTML = `<p style="color:var(--text-dim); text-align:center;">${t('no_awards_yet')}</p>`;
        return;
    }

    // 1. Team of the Week (Most goals scored)
    let bestTeamStats = { name: '', goals: -1 };

    // Create map of team to goals this week
    const teamGoals = {};
    const teamGD = {}; // For biggest win

    thisWeekMatches.forEach(m => {
        teamGoals[m.team1] = (teamGoals[m.team1] || 0) + m.score1;
        teamGoals[m.team2] = (teamGoals[m.team2] || 0) + m.score2;

        // Track GD for biggest win
        const gd = Math.abs(m.score1 - m.score2);
        const winner = m.score1 > m.score2 ? m.team1 : (m.score2 > m.score1 ? m.team2 : 'Draw');

        if (winner !== 'Draw' && (!teamGD[winner] || gd > teamGD[winner])) {
            teamGD[winner] = { gd: gd, match: `${m.team1} ${m.score1}-${m.score2} ${m.team2}` };
        }
    });

    Object.entries(teamGoals).forEach(([team, goals]) => {
        if (goals > bestTeamStats.goals) {
            bestTeamStats = { name: team, goals: goals };
        }
    });

    // 2. Biggest Win
    let biggestWin = { name: '', gd: -1, matchStr: '' };
    Object.entries(teamGD).forEach(([team, stats]) => {
        if (stats.gd > biggestWin.gd) {
            biggestWin = { name: team, gd: stats.gd, matchStr: stats.match };
        }
    });

    container.innerHTML = `
        <div class="award-card">
            <i data-lucide="crown" class="award-icon" style="color: gold;"></i>
            <h3 style="color: gold; margin-bottom: 0.5rem;" data-i18n="team_of_the_week">${t('team_of_the_week')} (Week ${latestWeek})</h3>
            <div class="award-team">${bestTeamStats.name || 'N/A'}</div>
            <div class="award-stat">${bestTeamStats.goals} Goals</div>
        </div>
        
        <div class="award-card award-silver">
            <i data-lucide="zap" class="award-icon" style="color: silver;"></i>
            <h3 style="color: silver; margin-bottom: 0.5rem;" data-i18n="biggest_win">${t('biggest_win')} (Week ${latestWeek})</h3>
            <div class="award-team">${biggestWin.name || 'N/A'}</div>
            <div class="award-stat">+${biggestWin.gd > 0 ? biggestWin.gd : '-'} GD</div>
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 0.5rem;">${biggestWin.matchStr}</div>
        </div>
    `;

    lucide.createIcons();
    // After HTML update, apply safe translations
    translatePage();
}

function populateSelects() {
    const s1 = document.getElementById('match-t1');
    const s2 = document.getElementById('match-t2');
    const ttSelect = document.getElementById('trash-talk-match-id');

    if (s1) s1.innerHTML = '<option value="">Select Team 1</option>';
    if (s2) s2.innerHTML = '<option value="">Select Team 2</option>';
    if (ttSelect) ttSelect.innerHTML = '<option value="">-- General / No Match --</option>';

    teams.forEach(team => {
        const opt = `<option value="${team.name}">${team.name}</option>`;
        if (s1) s1.innerHTML += opt;
        if (s2) s2.innerHTML += opt;
    });

    if (ttSelect) {
        const upcomingMatches = matches.filter(m => !m.played)
            .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

        upcomingMatches.forEach(m => {
            ttSelect.innerHTML += `<option value="${m.id}">${m.team1} vs ${m.team2} (Week ${m.week || 1})</option>`;
        });
    }
}


// --- Trash Talk ---
async function submitTrashTalk(e) {
    e.preventDefault();
    if (!supabaseClient) return;

    const matchId = document.getElementById('trash-talk-match-id').value;
    const author = document.getElementById('trash-talk-author').value;
    const message = document.getElementById('trash-talk-message').value;

    const postData = {
        author: author,
        message: message,
        votes: 0
    };
    if (matchId) postData.match_id = parseInt(matchId);

    const { error } = await supabaseClient.from('trash_talk').insert([postData]);

    if (error) {
        alert(t('alert_error_generic') + error.message);
        return;
    }

    closeModal('trash-talk-modal');
    e.target.reset();
    await loadInitialData(); // Re-fetch and re-render
}

async function voteTrashTalk(id) {
    if (!supabaseClient) return;

    // Prevent multiple votes from same browser
    const votedPosts = JSON.parse(localStorage.getItem('pesLeagueVotedPosts') || '[]');
    if (votedPosts.includes(id)) {
        return; // Already voted
    }

    const post = trashTalkPosts.find(p => p.id === id);
    if (!post) return;

    const { error } = await supabaseClient
        .from('trash_talk')
        .update({ votes: post.votes + 1 })
        .eq('id', id);

    if (error) {
        alert(t('alert_error_generic') + error.message);
        return;
    }

    votedPosts.push(id);
    localStorage.setItem('pesLeagueVotedPosts', JSON.stringify(votedPosts));
    post.votes += 1; // Optimistic update

    // Re-sort and render
    trashTalkPosts.sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    renderTrashTalk();
}

function renderTrashTalk() {
    const container = document.getElementById('trash-talk-container');
    if (!container) return;
    container.innerHTML = '';

    if (trashTalkPosts.length === 0) {
        container.innerHTML = `<p style="color:var(--text-dim); text-align:center;">No trash talk yet. Be the first!</p>`;
        return;
    }

    const votedPosts = JSON.parse(localStorage.getItem('pesLeagueVotedPosts') || '[]');

    // Render top 6 posts
    trashTalkPosts.slice(0, 6).forEach(post => {
        const card = document.createElement('div');
        card.className = `glass-card trash-talk-card ${post.votes > 10 ? 'on-fire' : ''}`;

        let matchContext = 'General banter';
        if (post.match_id) {
            const match = matches.find(m => m.id === post.match_id);
            if (match) matchContext = `RE: ${match.team1} vs ${match.team2}`;
        }

        const hasVoted = votedPosts.includes(post.id);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.5rem;">
                <div>
                    <strong style="color:var(--secondary); font-size: 1.1rem;">${post.author}</strong>
                    <div style="font-size: 0.75rem; color:var(--text-dim);">${matchContext}</div>
                </div>
                <button 
                    class="btn-vote ${hasVoted ? 'voted' : ''}" 
                    onclick="voteTrashTalk(${post.id})" 
                    ${hasVoted ? 'disabled' : ''}
                    title="${hasVoted ? 'Already voted' : 'Upvote'}"
                >
                    <i data-lucide="thumbs-up"></i> ${post.votes}
                </button>
            </div>
            <p style="font-size: 0.95rem; margin-top: 0.5rem; word-break: break-word;">${post.message}</p>
        `;
        container.appendChild(card);
    });

    lucide.createIcons();
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
        "weekly_awards": "WEEKLY AWARDS",
        "team_of_the_week": "TEAM OF THE WEEK",
        "biggest_win": "BIGGEST WIN",
        "no_awards_yet": "No awards yet for this week.",
        "trash_talk_board": "TRASH TALK BOARD",
        "post_trash_talk": "POST TRASH TALK",
        "select_match": "Select Match",
        "message": "Message",
        "post_it": "POST IT 🔥",
        "match_schedule": "MATCH SCHEDULE",
        "knockout_stage": "KNOCKOUT STAGE",
        "quarter_finals": "Quarter Finals",
        "semi_finals": "Semi Finals",
        "final": "Final",
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
        "global_timezone": "GLOBAL TIMEZONE",
        "timezone_desc": "Set the timezone used to display all match schedules and history dates.",
        "save": "SAVE",
        "schedule_new_match": "SCHEDULE NEW MATCH",
        "team_1": "Team 1",
        "team_2": "Team 2",
        "stage": "Stage",
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
        "weekly_awards": "HƏFTƏNİN MÜKAFATLARI",
        "team_of_the_week": "HƏFTƏNİN KOMANDASI",
        "biggest_win": "ƏN BÖYÜK QƏLƏBƏ",
        "no_awards_yet": "Bu həftə üçün hələ mükafat yoxdur.",
        "trash_talk_board": "TRASH TALK LÖVHƏSİ",
        "post_trash_talk": "TRASH TALK PAYLAŞ",
        "select_match": "Oyun Seçin",
        "message": "Mesaj",
        "post_it": "PAYLAŞ 🔥",
        "match_schedule": "OYUN TƏQVİMİ",
        "knockout_stage": "PLEY-OFF MƏRHƏLƏSİ",
        "quarter_finals": "1/4 Final",
        "semi_finals": "Yarımfinal",
        "final": "Final",
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
        "global_timezone": "QİMMƏCİ SAAT QURŞAĞI",
        "timezone_desc": "Bütün oyunların təqvimini və tarixçəsini göstərmək üçün saat qurşağını təyin edin.",
        "save": "YADDA SAXLA",
        "schedule_new_match": "YENİ OYUN PLANLAŞDIR",
        "team_1": "Komanda 1",
        "team_2": "Komanda 2",
        "stage": "Mərhələ",
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
