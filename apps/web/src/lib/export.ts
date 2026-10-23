/**
 * Module d'Export Universel C.F.T. (CSV UTF-8, Excel, Impression PDF Haute Fidélité)
 */

export function exportToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const sanitize = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent =
    '\uFEFF' + // UTF-8 BOM pour ouverture directe avec accents dans Microsoft Excel
    [headers.map(sanitize).join(';'), ...rows.map((row) => row.map(sanitize).join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  // XML Spreadsheet 2003 : nativement reconnu par toutes versions d'Excel, sans dépendance lourde
  const escapeXml = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const headerCells = headers
    .map(
      (h) => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`,
    )
    .join('');

  const rowsXml = rows
    .map((r) => {
      const cells = r
        .map((val) => {
          const isNum = typeof val === 'number' && !isNaN(val);
          const type = isNum ? 'Number' : 'String';
          return `<Cell ss:StyleID="DataStyle"><Data ss:Type="${type}">${escapeXml(val)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#111827"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyle">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F3F4F6"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
   <Row ss:Height="24">${headerCells}</Row>
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.xls') ? filename : `${filename}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  summaryCards?: { label: string; value: string | number }[],
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Veuillez autoriser les fenêtres pop-up pour afficher le rapport imprimable.');
    return;
  }

  const dateStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const summaryHtml =
    summaryCards && summaryCards.length > 0
      ? `<div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
          ${summaryCards
            .map(
              (card) => `
            <div style="flex: 1; min-width: 130px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${card.label}</div>
              <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px;">${card.value}</div>
            </div>`,
            )
            .join('')}
        </div>`
      : '';

  const tableHeader = headers
    .map(
      (h) =>
        `<th style="background: #0f172a; color: #ffffff; padding: 10px 12px; font-size: 11px; font-weight: 600; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #0f172a;">${h}</th>`,
    )
    .join('');

  const tableRows = rows
    .map(
      (row, idx) => `
      <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        ${row
          .map(
            (cell) => `
          <td style="padding: 8px 12px; font-size: 11px; color: #334155; border-bottom: 1px solid #e2e8f0;">
            ${cell !== null && cell !== undefined ? String(cell) : '-'}
          </td>`,
          )
          .join('')}
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${title} - C.F.T. Monastère Mont Fébé</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; padding: 10px 16px; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 13px; color: #0369a1; font-weight: 500;">Aperçu du rapport avant impression ou enregistrement en PDF</span>
    <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;">Imprimer en PDF</button>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
    <div>
      <div style="font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
        Centre de Formation Technique (C.F.T.)
      </div>
      <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-top: 2px;">
        Monastère des Bénédictins du Mont Fébé · Menuiserie &amp; Ateliers
      </div>
      <h1 style="font-size: 18px; font-weight: 700; margin: 10px 0 2px 0; color: #0f172a;">${title}</h1>
      <div style="font-size: 12px; color: #64748b;">${subtitle}</div>
    </div>
    <div style="text-align: right;">
      <img src="/logo.png" alt="Logo C.F.T." style="height: 48px; object-fit: contain; margin-bottom: 4px;" onerror="this.style.display='none'" />
      <div style="font-size: 11px; color: #64748b;">Édité le ${dateStr}</div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Document officiel certifié</div>
    </div>
  </div>

  ${summaryHtml}

  <table>
    <thead>
      <tr>${tableHeader}</tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div style="margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid;">
    <div style="width: 220px; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 8px;">
      <div style="font-size: 11px; font-weight: 600; color: #475569;">Le Superviseur / Responsable</div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 28px;">Visa &amp; Signature</div>
    </div>
    <div style="width: 220px; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 8px;">
      <div style="font-size: 11px; font-weight: 600; color: #475569;">La Direction du Monastère</div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 28px;">Cachet &amp; Approbation</div>
    </div>
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
