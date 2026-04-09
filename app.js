import { initAuth, login, logout } from './auth.js';
import { addEntry, getAllEntries, getEntry, updateEntry, deleteEntry, getLatestMileage, getActiveReminders } from './db.js';
import { exportToExcel, importFromExcel } from './export.js';
import { scanInvoice } from './scanner.js';

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

    document.getElementById('fab').classList.toggle('hidden', name === 'add' || name === 'scan');

    if (name === 'history') loadEntries();
    if (name === 'reminders') loadReminders();
    if (name === 'add') {
        if (editingId === null) resetForm();
        document.getElementById('entry-description').focus();
    }
    if (name === 'scan') resetScan();
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

    list.innerHTML = entries.map(e => {
        let itemsHtml = '';
        if (Array.isArray(e.services) || Array.isArray(e.parts)) {
            itemsHtml = renderItemsSection(e.services, 'service') + renderItemsSection(e.parts, 'part');
        } else if (e.parts) {
            itemsHtml = `<div style="font-size:13px;color:#666;padding:6px 0">🔧 ${escapeHtml(e.parts)}</div>`;
        }
        return `
        <div class="entry-card" data-id="${e.id}">
            <div class="entry-card-header">
                <span class="entry-date">${formatDate(e.date)}</span>
                <div class="card-actions">
                    <button class="edit-btn" onclick="openEditForm('${e.id}')" title="Edytuj">&#9998;</button>
                    <button class="delete-btn" onclick="openDeleteDialog('${e.id}')" title="Usun">&times;</button>
                </div>
            </div>
            <div class="entry-description">${escapeHtml(e.description)}</div>
            ${itemsHtml}
            <div class="entry-footer">
                ${e.price ? `<strong>${formatPrice(e.price)}</strong>` : ''}
                <span>${formatMileage(e.mileage)}</span>
                ${e.reminder_km ? `<span class="entry-reminder-tag">🔔 ${formatMileage(e.reminder_km)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
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

    const services = collectItems('entry-services-list');
    const parts = collectItems('entry-parts-list');

    // Wylicz cenę z pozycji, lub weź wpisaną ręcznie
    const priceVal = parseFloat(document.getElementById('entry-price').value) || 0;

    const entry = {
        date: document.getElementById('entry-date').value,
        description: document.getElementById('entry-description').value.trim(),
        services,
        parts,
        price: priceVal,
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
    document.getElementById('entry-price').value = entry.price || '';
    document.getElementById('entry-mileage').value = entry.mileage;
    document.getElementById('entry-reminder').value = entry.reminder_km || '';
    document.getElementById('form-title').textContent = 'Edytuj wpis';
    document.getElementById('form-submit-btn').textContent = 'Zaktualizuj';

    // Populate services
    populateItemList('entry-services-list', entry.services || []);

    // Populate parts — obsługa starego formatu (string)
    if (Array.isArray(entry.parts)) {
        populateItemList('entry-parts-list', entry.parts);
    } else if (typeof entry.parts === 'string' && entry.parts) {
        const legacyParts = entry.parts.split(',').map(p => ({ name: p.trim(), qty: 1, price: 0 })).filter(p => p.name);
        populateItemList('entry-parts-list', legacyParts);
    } else {
        clearItemList('entry-parts-list');
    }

    showView('add');
}
window.openEditForm = openEditForm;

function resetForm() {
    editingId = null;
    document.getElementById('entry-form').reset();
    setDefaultDate();
    document.getElementById('form-title').textContent = 'Dodaj wpis';
    document.getElementById('form-submit-btn').textContent = 'Zapisz';
    clearItemList('entry-services-list');
    clearItemList('entry-parts-list');
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

// --- Item rows (services / parts) ---
function escapeAttr(text) {
    return String(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function createItemRow(name = '', qty = 1, price = '') {
    const div = document.createElement('div');
    div.className = 'part-row';
    div.innerHTML = `
        <input type="text" class="item-name" value="${escapeAttr(name)}" placeholder="Nazwa" oninput="recalcPrice(this)">
        <input type="number" class="item-qty" value="${qty}" min="1" step="1" style="text-align:center" oninput="recalcPrice(this)">
        <input type="number" class="item-price" value="${price}" placeholder="0.00" step="0.01" min="0" style="text-align:right" oninput="recalcPrice(this)">
        <button type="button" class="part-remove-btn" onclick="this.closest('.part-row').remove(); recalcPrice(this)" title="Usun">&#x2715;</button>`;
    return div;
}

function recalcPrice(el) {
    // find the form context (entry or scan)
    const form = el ? el.closest('form, .entry-form, #view-add, #view-scan') : null;
    const prefix = form && form.id === 'entry-form' ? 'entry' :
                   (form && form.closest('#view-scan')) ? 'scan' : null;
    if (!prefix) return;
    recalcPriceFor(prefix);
}
window.recalcPrice = recalcPrice;

function recalcPriceFor(prefix) {
    const prices = [
        ...document.querySelectorAll(`#${prefix}-services-list .item-price`),
        ...document.querySelectorAll(`#${prefix}-parts-list .item-price`)
    ].map(el => parseFloat(el.value) || 0);
    const total = prices.reduce((a, b) => a + b, 0);
    const priceEl = document.getElementById(`${prefix}-price`);
    if (priceEl) priceEl.value = total > 0 ? total.toFixed(2) : '';
}

function addItemRow(containerId, placeholder) {
    const container = document.getElementById(containerId);
    const row = createItemRow('', 1, '');
    row.querySelector('.item-name').placeholder = placeholder;
    container.appendChild(row);
    row.querySelector('input').focus();
    // recalc for the containing form
    const prefix = containerId.startsWith('entry') ? 'entry' : 'scan';
    recalcPriceFor(prefix);
}
window.addItemRow = addItemRow;

function collectItems(containerId) {
    return [...document.querySelectorAll(`#${containerId} .part-row`)]
        .map(row => ({
            name: row.querySelector('.item-name').value.trim(),
            qty: parseInt(row.querySelector('.item-qty').value) || 1,
            price: parseFloat(row.querySelector('.item-price').value) || 0,
        }))
        .filter(item => item.name);
}

function populateItemList(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    (items || []).forEach(item => container.appendChild(createItemRow(item.name, item.qty || 1, item.price || '')));
}

function clearItemList(containerId) {
    document.getElementById(containerId).innerHTML = '';
}

function renderItemsSection(items, type) {
    if (!items || items.length === 0) return '';
    const isService = type === 'service';
    const label = isService ? '⚙️ Usługi' : '🔧 Części';
    const cls = isService ? 'svc' : 'prt';
    const rows = items.map(item => {
        const qtyCell = `<td class="col-qty">${(item.qty && item.qty > 1) ? item.qty + ' szt.' : '1 szt.'}</td>`;
        const priceCell = item.price
            ? `<td class="col-price ${cls}">${formatPrice(item.price)}</td>`
            : `<td class="col-price">—</td>`;
        return `<tr><td class="col-name">${escapeHtml(item.name)}</td>${qtyCell}${priceCell}</tr>`;
    }).join('');
    return `<div class="card-section-label ${cls}">${label}</div><table class="items-table">${rows}</table>`;
}

// --- Scan ---
function resetScan() {
    document.getElementById('scan-file').value = '';
    document.getElementById('scan-upload-area').classList.remove('hidden');
    document.getElementById('scan-preview-container').classList.add('hidden');
    document.getElementById('scan-spinner').classList.add('hidden');
    document.getElementById('scan-result').classList.add('hidden');
    clearItemList('scan-services-list');
    clearItemList('scan-parts-list');
}

document.getElementById('scan-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        document.getElementById('scan-preview').src = ev.target.result;
        document.getElementById('scan-upload-area').classList.add('hidden');
        document.getElementById('scan-preview-container').classList.remove('hidden');
        document.getElementById('scan-result').classList.add('hidden');
        document.getElementById('scan-spinner').classList.add('hidden');
    };
    reader.readAsDataURL(file);
});

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const [header, base64] = reader.result.split(',');
            const mediaType = header.match(/:(.*?);/)[1];
            resolve({ base64, mediaType });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function analyzeScan() {
    const file = document.getElementById('scan-file').files[0];
    if (!file) return;

    document.getElementById('scan-preview-container').classList.add('hidden');
    document.getElementById('scan-spinner').classList.remove('hidden');

    try {
        const { base64, mediaType } = await readFileAsBase64(file);
        const result = await scanInvoice(base64, mediaType);

        // Populate services
        const services = Array.isArray(result.services) ? result.services.filter(i => i && i.name) : [];
        populateItemList('scan-services-list', services);

        // Populate parts
        const parts = Array.isArray(result.parts) ? result.parts.filter(i => i && i.name) :
                      Array.isArray(result.items) ? result.items.filter(i => i && i.name) : [];
        populateItemList('scan-parts-list', parts);

        document.getElementById('scan-date').value = result.date || new Date().toISOString().split('T')[0];
        document.getElementById('scan-description').value = result.description || '';
        document.getElementById('scan-price').value = result.total_price || '';

        // Recalc from items if no total_price
        if (!result.total_price) recalcPriceFor('scan');

        document.getElementById('scan-mileage').value = '';
        document.getElementById('scan-reminder').value = '';

        document.getElementById('scan-spinner').classList.add('hidden');
        document.getElementById('scan-result').classList.remove('hidden');
    } catch (err) {
        document.getElementById('scan-spinner').classList.add('hidden');
        document.getElementById('scan-preview-container').classList.remove('hidden');
        showToast('Blad analizy — sprobuj ponownie');
        console.error(err);
    }
}
window.analyzeScan = analyzeScan;

async function saveScanEntry() {
    const description = document.getElementById('scan-description').value.trim();
    const mileageVal = document.getElementById('scan-mileage').value;

    if (!description) { showToast('Opis jest wymagany'); return; }
    if (!mileageVal) { showToast('Przebieg jest wymagany'); return; }

    const entry = {
        date: document.getElementById('scan-date').value,
        description,
        services: collectItems('scan-services-list'),
        parts: collectItems('scan-parts-list'),
        price: parseFloat(document.getElementById('scan-price').value) || 0,
        mileage: parseInt(mileageVal),
        reminder_km: parseInt(document.getElementById('scan-reminder').value) || null
    };

    await addEntry(entry);
    showToast('Zapisano!');
    resetScan();
    showView('history');
    updateReminderBanner();
    updateMileageBadge();
}
window.saveScanEntry = saveScanEntry;

function cancelScan() {
    resetScan();
    showView('history');
}
window.cancelScan = cancelScan;

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
