// State Management
let teams = JSON.parse(localStorage.getItem('pro_pes_teams')) || [];
let matches = JSON.parse(localStorage.getItem('pro_pes_matches')) || [];
let zones = JSON.parse(localStorage.getItem('pro_pes_zones')) || { next: 2, playoff: 2, out: 2 };
let isAdmin = false;

// Credentials
const ADMIN_EMAIL = "ziyazer11@gmail.com";
const ADMIN_PASS = "Hasanzade2011!";

// DOM Elements
const standingsBody = document.getElementById('standings-body');
const scheduleList = document.getElementById('schedule-list');
const adminLoginModal = document.getElementById('admin-login-modal');
const adminDashboard = document.getElementById('admin-dashboard');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    renderStandings();
    renderSchedule();
    updateUIForAuth();

    // Set initial zone values in inputs if available
    if (isAdmin) {
        document.getElementById('zone-next-count').value = zones.next;
        document.getElementById('zone-playoff-count').value = zones.playoff;
        document.getElementById('zone-out-count').value = zones.out;
    }
});

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
    const adminLink = document.getElementById('admin-nav-link');
    const adminPanel = document.getElementById('admin-section');
    const loginBtn = document.getElementById('login-trigger-btn');

    if (isAdmin) {
        adminPanel.style.display = 'block';
        loginBtn.textContent = 'LOGOUT';
        loginBtn.onclick = logout;
        document.body.classList.add('is-admin');

        // Sync zone inputs
        document.getElementById('zone-next-count').value = zones.next;
        document.getElementById('zone-playoff-count').value = zones.playoff;
        document.getElementById('zone-out-count').value = zones.out;
    } else {
        adminPanel.style.display = 'none';
        loginBtn.textContent = 'ADMIN LOGIN';
        loginBtn.onclick = () => openModal('admin-login-modal');
        document.body.classList.remove('is-admin');
    }
    renderStandings();
}

// --- Team Management ---
function addTeam() {
    if (!isAdmin) return;
    const nameInput = document.getElementById('new-team-name');
    const name = nameInput.value.trim();
    if (!name) return;

    if (teams.find(t => t.name === name)) {
        alert("Team already exists");
        return;
    }

    teams.push({
        name: name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
    });

    saveData();
    nameInput.value = '';
    renderStandings();
    populateSelects();
}

function removeTeam(teamName) {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to remove ${teamName}?`)) return;
    teams = teams.filter(t => t.name !== teamName);
    saveData();
    renderStandings();
    populateSelects();
}

function renameTeam(oldName) {
    if (!isAdmin) return;
    const newName = prompt("Enter new team name:", oldName);
    if (!newName || newName === oldName) return;

    const team = teams.find(t => t.name === oldName);
    if (team) {
        team.name = newName;
        saveData();
        renderStandings();
        populateSelects();
    }
}

// --- Match Management ---
function scheduleMatch(e) {
    if (!isAdmin) return;
    e.preventDefault();
    const t1 = document.getElementById('match-t1').value;
    const t2 = document.getElementById('match-t2').value;
    const dateTime = document.getElementById('match-datetime').value;

    if (t1 === t2) {
        alert("Cannot play against the same team");
        return;
    }

    matches.push({
        id: Date.now(),
        team1: t1,
        team2: t2,
        dateTime: dateTime,
        played: false,
        score1: 0,
        score2: 0
    });

    saveData();
    renderSchedule();
}

function recordResult(matchId) {
    if (!isAdmin) return;
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const score1 = parseInt(prompt(`Score for ${match.team1}:`, 0));
    const score2 = parseInt(prompt(`Score for ${match.team2}:`, 0));

    if (isNaN(score1) || isNaN(score2)) return;

    match.score1 = score1;
    match.score2 = score2;
    match.played = true;

    saveData();
    recalculateStandings();
    renderSchedule();
}

function deleteMatch(matchId) {
    if (!isAdmin) return;
    if (!confirm("Delete this match?")) return;
    matches = matches.filter(m => m.id !== matchId);
    saveData();
    recalculateStandings();
    renderSchedule();
}

// --- Core Logic ---
function recalculateStandings() {
    // Reset all team stats
    teams.forEach(t => {
        t.played = 0;
        t.wins = 0;
        t.draws = 0;
        t.losses = 0;
        t.gf = 0;
        t.ga = 0;
        t.gd = 0;
        t.pts = 0;
    });

    // Calculate from matches
    matches.filter(m => m.played).forEach(m => {
        const t1 = teams.find(t => t.name === m.team1);
        const t2 = teams.find(t => t.name === m.team2);

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

    teams.forEach(t => t.gd = t.gf - t.ga);

    // Sort: Points > GD > GF
    teams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

    saveData();
    renderStandings();
}

// --- Rendering ---
function renderStandings() {
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
            <td class="pts">${t.pts}</td>
        `;
        standingsBody.appendChild(row);
    });
}

function renderSchedule() {
    scheduleList.innerHTML = '';

    // Sort matches by time
    const sortedMatches = [...matches].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    sortedMatches.forEach(m => {
        const card = document.createElement('div');
        card.className = 'glass-card match-card';

        const dateStr = new Date(m.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

        card.innerHTML = `
            <div class="match-info">
                <strong>${dateStr}</strong><br>
                ${m.played ? '<span style="color:var(--primary)">COMPLETED</span>' : '<span style="color:var(--text-dim)">SCHEDULED</span>'}
            </div>
            <div class="match-teams">
                <span>${m.team1}</span>
                <span class="vs">${m.played ? `${m.score1} - ${m.score2}` : 'VS'}</span>
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
function saveData() {
    localStorage.setItem('pro_pes_teams', JSON.stringify(teams));
    localStorage.setItem('pro_pes_matches', JSON.stringify(matches));
    localStorage.setItem('pro_pes_zones', JSON.stringify(zones));
}

function updateZones() {
    if (!isAdmin) return;
    zones.next = parseInt(document.getElementById('zone-next-count').value) || 0;
    zones.playoff = parseInt(document.getElementById('zone-playoff-count').value) || 0;
    zones.out = parseInt(document.getElementById('zone-out-count').value) || 0;
    saveData();
    renderStandings();
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}