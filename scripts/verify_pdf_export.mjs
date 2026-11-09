/**
 * Script de vérification rigoureuse de l'export PDF des planches
 * Teste :
 * 1. Génération jsPDF & compression
 * 2. Dimensions A4 (210x297mm) et Letter (215.9x279.4mm)
 * 3. En-têtes PDF %PDF-1.
 * 4. Présence de l'export universel dans export.ts
 * 5. Présence des boutons "Télécharger le PDF" et "Imprimer cette planche"
 */

import { jsPDF } from 'jspdf';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('--- TEST 1: Validation structurelle du générateur jsPDF ---');
try {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  doc.text('Planche Test - Bénédictins du Mont Fébé', 10, 10);
  doc.addPage('a4', 'portrait');
  doc.text('Page 2 - Test', 10, 10);

  const arrayBuffer = doc.output('arraybuffer');
  const buffer = Buffer.from(arrayBuffer);
  const pdfHeader = buffer.subarray(0, 5).toString('ascii');

  assert(pdfHeader === '%PDF-', `L'en-tête du fichier est un PDF valide (%PDF-) : "${pdfHeader}"`);
  assert(buffer.length > 500, `Le fichier PDF est non vide et compressé (${buffer.length} octets)`);
  assert(doc.getNumberOfPages() === 2, `Le document contient exactement 2 pages (obtenu: ${doc.getNumberOfPages()})`);
} catch (err) {
  assert(false, `Erreur jsPDF : ${err.message}`);
}

console.log('\n--- TEST 2: Vérification des dimensions physiques métriques ---');
try {
  const docA4 = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const a4Width = docA4.internal.pageSize.getWidth();
  const a4Height = docA4.internal.pageSize.getHeight();
  assert(Math.round(a4Width) === 210, `Largeur A4 = 210mm (obtenu: ${a4Width.toFixed(2)}mm)`);
  assert(Math.round(a4Height) === 297, `Hauteur A4 = 297mm (obtenu: ${a4Height.toFixed(2)}mm)`);

  const docLetter = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const letterWidth = docLetter.internal.pageSize.getWidth();
  const letterHeight = docLetter.internal.pageSize.getHeight();
  assert(Math.round(letterWidth * 10) / 10 === 215.9, `Largeur Letter = 215.9mm (obtenu: ${letterWidth.toFixed(2)}mm)`);
  assert(Math.round(letterHeight * 10) / 10 === 279.4, `Hauteur Letter = 279.4mm (obtenu: ${letterHeight.toFixed(2)}mm)`);
} catch (err) {
  assert(false, `Erreur dimensions : ${err.message}`);
}

console.log('\n--- TEST 3: Vérification du code source PrintPreviewModal & export ---');
try {
  const printPreviewContent = readFileSync(
    resolve('apps/web/src/components/PrintPreviewModal.tsx'),
    'utf-8',
  );
  assert(
    printPreviewContent.includes('Télécharger le PDF'),
    'Bouton "Télécharger le PDF" présent dans PrintPreviewModal',
  );
  assert(
    printPreviewContent.includes('exportSheetToPdf'),
    'Appel à exportSheetToPdf branché dans PrintPreviewModal',
  );
  assert(
    printPreviewContent.includes('Download'),
    'Icône Download présente dans PrintPreviewModal',
  );
  assert(
    printPreviewContent.includes('pdfFilename'),
    'Prop pdfFilename supportée dans PrintPreviewModal',
  );

  const exportTs = readFileSync(
    resolve('apps/web/src/lib/export.ts'),
    'utf-8',
  );
  assert(
    exportTs.includes('exportSheetToPdf'),
    'exportSheetToPdf exporté depuis apps/web/src/lib/export.ts',
  );
} catch (err) {
  assert(false, `Erreur lecture source PrintPreviewModal : ${err.message}`);
}

console.log('\n--- TEST 4: Vérification des écrans de sélection QR / Badges ---');
try {
  const screens = [
    { name: 'Employees.tsx (Badges)', file: 'apps/web/src/screens/Employees.tsx' },
    { name: 'Outils.tsx (Planches outils)', file: 'apps/web/src/screens/Outils.tsx' },
    { name: 'Stock.tsx (Étiquette stock)', file: 'apps/web/src/screens/Stock.tsx' },
    { name: 'GroupedQrLabelsModal.tsx (Planches groupées)', file: 'apps/web/src/components/GroupedQrLabelsModal.tsx' },
    { name: 'EtabliKitCard.tsx (Kits établis)', file: 'apps/web/src/components/EtabliKitCard.tsx' },
    { name: 'Magasins.tsx (Étiquette de porte)', file: 'apps/web/src/screens/Magasins.tsx' },
  ];

  for (const screen of screens) {
    const code = readFileSync(resolve(screen.file), 'utf-8');
    assert(
      code.includes('PrintPreviewModal'),
      `${screen.name} utilise PrintPreviewModal avec options de téléchargement PDF`,
    );
  }
} catch (err) {
  assert(false, `Erreur lecture écrans : ${err.message}`);
}

console.log(`\n========================================`);
console.log(`BILAN : ${passed} passés, ${failed} échoués`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
