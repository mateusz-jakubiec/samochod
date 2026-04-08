import { initAuth, login, logout } from './auth.js';
import { addEntry, getAllEntries, getEntry, updateEntry, deleteEntry, getLatestMileage, getActiveReminders } from './db.js';
import { exportToExcel, importFromExcel } from './export.js';

let currentView = 'history';
let deleteTargetId = null;
let editingId = null;

// --- Auth ---
initAuth(
    (user) => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        init();
    },
    () => {
        document.getElementById('app').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
);

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');
    try {
        await login(email, password);
    } catch {
        errorEl.classList.remove('hidden');
    }
});

async function logoutUser() {
    await logout();
}
window.logoutUser = logoutUser;

// --- Navigation ---
function showView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === name);
    });

    document.getElementById('fab').classList.toggle('hidden', name === 'add');

    if (name === 'history') loadEntries();
    if (name === 'reminders') loadReminders();
    if (name === 'add') {
        if (editingId === null) resetForm();
        document.getElementById('entry-description').focus();
    }
}
window.showView = showView;

// --- Format helpers ---
function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
}

function formatPrice(price) {
    if (!price && price !== 0) return '';
    return Number(price).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' zl';
}

function formatMileage(km) {
    return Number(km).toLocaleString('pl-PL') + ' km';
}

// --- Render entries ---
async function loadEntries() {
    const entries = await getAllEntries();
    const list = document.getElementById('entries-list');
    const emptyState = document.getElementById('empty-state');

    if (entries.length === 0) {
        list.innerHTML = '';
        list.appendChild(emptyState);
        emptyState.classList.remove('hidden');
        return;
    }

    list.innerHTML = entries.map(e => `
        <div class="entry-card" data-id="${e.id}">
            <div class="entry-card-header">
                <span class="entry-date">${formatDate(e.date)}</span>
                <div class="card-actions">
                    <button class="edit-btn" onclick="openEditForm('${e.id}')" title="Edytuj">&#9998;</button>
                    <button class="delete-btn" onclick="openDeleteDialog('${e.id}')" title="Usun">&times;</button>
                </div>
            </div>
            <div class="entry-description">${escapeHtml(e.description)}</div>
            <div class="entry-details">
                ${e.parts ? `<span class="entry-detail">🔧 ${escapeHtml(e.parts)}</span>` : ''}
                ${e.price ? `<span class="entry-detail"><strong>${formatPrice(e.price)}</strong></span>` : ''}
                <span class="entry-detail">${formatMileage(e.mileage)}</span>
            </div>
            ${e.reminder_km ? `<span class="entry-reminder-tag">Przypomnienie: ${formatMileage(e.reminder_km)}</span>` : ''}
        </div>
    `).join('');
}

// --- Render reminders ---
async function loadReminders() {
    const reminders = await getActiveReminders();
    const list = document.getElementById('reminders-list');
    const emptyState = document.getElementById('reminders-empty');

    if (reminders.length === 0) {
        list.innerHTML = '';
        list.appendChild(emptyState);
        emptyState.classList.remove('hidden');
        return;
    }

    list.innerHTML = reminders.map(r => {
        let cls = '';
        let statusText = '';
        if (r.remaining_km <= 0) {
            cls = 'danger';
            statusText = `Przeterminowane o ${formatMileage(Math.abs(r.remaining_km))}`;
        } else if (r.remaining_km <= 2000) {
            cls = 'danger';
            statusText = `Pozostalo: ${formatMileage(r.remaining_km)}`;
        } else if (r.remaining_km <= 5000) {
            cls = 'warning';
            statusText = `Pozostalo: ${formatMileage(r.remaining_km)}`;
        } else {
            statusText = `Pozostalo: ${formatMileage(r.remaining_km)}`;
        }

        return `
            <div class="reminder-card ${cls}">
                <div class="reminder-description">${escapeHtml(r.description)}</div>
                <div class="reminder-info">Serwis przy ${formatMileage(r.reminder_km)} (wpis z ${formatDate(r.date)})</div>
                <div class="reminder-remaining">${statusText}</div>
            </div>
        `;
    }).join('');
}

// --- Reminder banner ---
async function updateReminderBanner() {
    const reminders = await getActiveReminders();
    const banner = document.getElementById('reminder-banner');
    const text = document.getElementById('reminder-banner-text');
    const urgent = reminders.filter(r => r.remaining_km <= 2000);

    if (urgent.length === 0) {
        banner.classList.add('hidden');
        document.body.style.paddingTop = '';
        return;
    }

    const overdue = urgent.filter(r => r.remaining_km <= 0);
    if (overdue.length > 0) {
        banner.className = 'reminder-banner danger';
        text.textContent = `${overdue.length} przeterminion${overdue.length === 1 ? 'e' : 'ych'} przypomni${overdue.length === 1 ? 'enie' : 'en'}!`;
    } else {
        banner.className = 'reminder-banner';
        text.textContent = `${urgent.length} przypomni${urgent.length === 1 ? 'enie' : 'en'} wkrotce`;
    }

    document.body.style.paddingTop = (56 + banner.offsetHeight) + 'px';
}

// --- Update mileage badge ---
async function updateMileageBadge() {
    const mileage = await getLatestMileage();
    document.getElementById('current-mileage').textContent = mileage > 0 ? formatMileage(mileage) : '-- km';
}

// --- Form handling ---
document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const entry = {
        date: document.getElementById('entry-date').value,
        description: document.getElementById('entry-description').value.trim(),
        parts: document.getElementById('entry-parts').value.trim(),
        price: parseFloat(document.getElementById('entry-price').value) || 0,
        mileage: parseInt(document.getElementById('entry-mileage').value),
        reminder_km: parseInt(document.getElementById('entry-reminder').value) || null
    };

    if (editingId !== null) {
        await updateEntry(editingId, entry);
        showToast('Zaktualizowano!');
    } else {
        await addEntry(entry);
        showToast('Zapisano!');
    }

    resetForm();
    showView('history');
    updateReminderBanner();
    updateMileageBadge();
});

// --- Edit ---
async function openEditForm(id) {
    const entry = await getEntry(id);
    if (!entry) return;

    editingId = id;
    document.getElementById('entry-date').value = entry.date;
    document.getElementById('entry-description').value = entry.description;
    document.getElementById('entry-parts').value = entry.parts || '';
    document.getElementById('entry-price').value = entry.price || '';
    document.getElementById('entry-mileage').value = entry.mileage;
    document.getElementById('entry-reminder').value = entry.reminder_km || '';
    document.getElementById('form-title').textContent = 'Edytuj wpis';
    document.getElementById('form-submit-btn').textContent = 'Zaktualizuj';

    showView('add');
}
window.openEditForm = openEditForm;

function resetForm() {
    editingId = null;
    document.getElementById('entry-form').reset();
    setDefaultDate();
    document.getElementById('form-title').textContent = 'Dodaj wpis';
    document.getElementById('form-submit-btn').textContent = 'Zapisz';
}

function cancelForm() {
    resetForm();
    showView('history');
}
window.cancelForm = cancelForm;

// --- Delete ---
function openDeleteDialog(id) {
    deleteTargetId = id;
    document.getElementById('delete-dialog').classList.remove('hidden');
}
window.openDeleteDialog = openDeleteDialog;

function closeDeleteDialog() {
    deleteTargetId = null;
    document.getElementById('delete-dialog').classList.add('hidden');
}
window.closeDeleteDialog = closeDeleteDialog;

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (deleteTargetId != null) {
        await deleteEntry(deleteTargetId);
        closeDeleteDialog();
        loadEntries();
        updateReminderBanner();
        updateMileageBadge();
        showToast('Usunieto');
    }
});

// --- Export ---
async function exportData() {
    const entries = await getAllEntries();
    if (entries.length === 0) {
        showToast('Brak danych do eksportu');
        return;
    }
    exportToExcel(entries);
}
window.exportData = exportData;

// --- Import ---
async function importData(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    try {
        const { imported, skipped } = await importFromExcel(file);
        if (imported === 0) {
            showToast('Brak wpisow do zaimportowania');
        } else {
            showToast(`Zaimportowano ${imported} wpis${imported === 1 ? '' : imported < 5 ? 'y' : 'ow'}${skipped > 0 ? ` (pominieto: ${skipped})` : ''}`);
            showView('history');
            updateReminderBanner();
            updateMileageBadge();
        }
    } catch (err) {
        showToast('Blad importu — sprawdz plik');
        console.error(err);
    }
}
window.importData = importData;

// --- Toast ---
function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// --- Helpers ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entry-date').value = today;
}

// --- Init ---
async function init() {
    setDefaultDate();
    await loadEntries();
    await updateReminderBanner();
    await updateMileageBadge();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}
