const ExcelJS = require('exceljs');
const path = require('path');

async function generate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Traffic Volume');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 22 },
    { header: 'PLMN Name', key: 'plmn', width: 18 },
    { header: '2G+3G data volume', key: 'vol2g3g', width: 20 },
    { header: '4G data volume', key: 'vol4g', width: 18 },
    { header: 'Total data volume', key: 'total', width: 20 },
  ];

  const plmn = 'BituTel-PLMN-001';
  const baseDate = new Date('2026-05-22T00:00:00');

  for (let hour = 0; hour < 24; hour++) {
    const date = new Date(baseDate);
    date.setHours(hour);

    const vol4g = 800 + Math.random() * 400 + hour * 15;
    const vol2g3g = 200 + Math.random() * 150 + hour * 5;
    const total = vol2g3g + vol4g;

    sheet.addRow({
      date,
      plmn,
      vol2g3g: Math.round(vol2g3g * 100) / 100,
      vol4g: Math.round(vol4g * 100) / 100,
      total: Math.round(total * 100) / 100,
    });
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF00B140' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const outPath = path.join(__dirname, '../../samples/traffic-volume-sample.xlsx');
  const fs = require('fs');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await workbook.xlsx.writeFile(outPath);
  console.log(`Sample Excel generated: ${outPath}`);
}

generate().catch(console.error);
