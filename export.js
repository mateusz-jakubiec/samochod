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
