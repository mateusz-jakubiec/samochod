let currentView = 'history';
let deleteTargetId = null;

// --- Navigation ---
function showView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === name);
    });

    // Hide FAB on add view
    document.getElementById('fab').classList.toggle('hidden', name === 'add');

    if (name === 'history') loadEntries();
    if (name === 'reminders') loadReminders();
    if (name === 'add') document.getElementById('entry-description').focus();
}

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
                <button class="delete-btn" onclick="openDeleteDialog(${e.id})" title="Usun">&times;</button>
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

    // Shift content down when banner is visible
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

    await addEntry(entry);

    // Reset form
    document.getElementById('entry-form').reset();
    setDefaultDate();

    showToast('Zapisano!');
    showView('history');
    updateReminderBanner();
    updateMileageBadge();
});

// --- Delete ---
function openDeleteDialog(id) {
    deleteTargetId = id;
    document.getElementById('delete-dialog').classList.remove('hidden');
}

function closeDeleteDialog() {
    deleteTargetId = null;
    document.getElementById('delete-dialog').classList.add('hidden');
}

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

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

init();
