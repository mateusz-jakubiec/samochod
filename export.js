// Mapowanie nazw kolumn z Excela na pola w bazie
const COL_MAP = {
    'Data':               'date',
    'Opis':               'description',
    'Czesci':             'parts',
    'Cena (PLN)':         'price',
    'Przebieg (km)':      'mileage',
    'Przypomnienie (km)': 'reminder_km',
};

function parseExcelDate(val) {
    if (!val) return null;
    // Liczba seryjna Excela (np. 45000)
    if (typeof val === 'number') {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    // String "DD.MM.YYYY" lub "YYYY-MM-DD"
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
        const [d, m, y] = str.split('.');
        return `${y}-${m}-${d}`;
    }
    return null;
}

async function importFromExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

                let imported = 0;
                let skipped = 0;

                for (const row of rows) {
                    const date = parseExcelDate(row[Object.keys(row).find(k => k.trim() === 'Data')]);
                    const description = String(row[Object.keys(row).find(k => k.trim() === 'Opis')] || '').trim();
                    const mileage = parseInt(row[Object.keys(row).find(k => k.trim() === 'Przebieg (km)')]);

                    if (!date || !description || isNaN(mileage)) {
                        skipped++;
                        continue;
                    }

                    const partsKey = Object.keys(row).find(k => k.trim() === 'Czesci');
                    const priceKey = Object.keys(row).find(k => k.trim() === 'Cena (PLN)');
                    const reminderKey = Object.keys(row).find(k => k.trim() === 'Przypomnienie (km)');

                    await addEntry({
                        date,
                        description,
                        parts: partsKey ? String(row[partsKey] || '').trim() : '',
                        price: priceKey ? parseFloat(row[priceKey]) || 0 : 0,
                        mileage,
                        reminder_km: reminderKey && row[reminderKey] ? parseInt(row[reminderKey]) || null : null,
                    });
                    imported++;
                }

                resolve({ imported, skipped });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function exportToExcel(entries) {
    const data = entries.map(e => ({
        'Data': e.date,
        'Opis': e.description,
        'Czesci': e.parts || '',
        'Cena (PLN)': e.price || 0,
        'Przebieg (km)': e.mileage,
        'Przypomnienie (km)': e.reminder_km || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
        { wch: 12 },  // Data
        { wch: 30 },  // Opis
        { wch: 25 },  // Czesci
        { wch: 12 },  // Cena
        { wch: 14 },  // Przebieg
        { wch: 18 },  // Przypomnienie
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Serwis');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `serwis-auta-${today}.xlsx`);
}
