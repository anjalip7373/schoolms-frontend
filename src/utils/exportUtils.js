import * as XLSX from 'xlsx-js-style'; // replaced 'xlsx' to enable cell coloring
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'react-toastify';
import { registerPdfFonts } from './pdfFonts';

const DownloadSaver = registerPlugin('DownloadSaver');

// Used for FILE NAMES only (keeps them ASCII-safe on every device).
const cleanText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
};

// Used for text drawn INSIDE the PDF. The embedded NotoSans font supports
// Latin + the Rupee sign, so we keep ₹ and common punctuation instead of stripping them.
const cleanDisplay = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20B9]/g, '')
    .trim();
};

// Turns full ISO timestamps (e.g. 2026-10-15T00:00:00.000Z) into just the date (2026-10-15)
// for BOTH Excel and PDF exports. Only exact timestamp values are touched.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;
const stripTime = (v) => {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  return typeof v === 'string' && ISO_DATETIME.test(v.trim()) ? v.trim().slice(0, 10) : v;
};
const dateOnlyRows = (data) =>
  data.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, stripTime(v)])));

const saveDirectToDownloads = async (base64Data, fileName, mimeType) => {
  try {
    toast.info(`Saving ${fileName}...`, { autoClose: 2000 });
    await DownloadSaver.saveToDownloads({ fileName, base64Data, mimeType });
    toast.success(`Saved to Downloads: ${fileName}`, { autoClose: 4000 });
  } catch (err) {
    console.error(`${fileName} save failed:`, err);
    toast.error(`Save failed: ${err?.message || JSON.stringify(err)}`, { autoClose: 5000 });
  }
};

// ─── EXCEL ───────────────────────────────────────────────────────────────
// highlightRows: array of 0-indexed positions into `data` that should be
// shown with a yellow fill (e.g. deactivated-during-this-period rows).
export const exportToExcel = async (data, columns, filename, highlightRows = []) => {
  const ws = XLSX.utils.json_to_sheet(dateOnlyRows(data));
  ws['!cols'] = columns.map(() => ({ wch: 20 }));

  if (highlightRows.length) {
    const highlightSet = new Set(highlightRows);
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r + 1; r <= range.e.r; r++) { // r=0 is header row
      const dataRowIndex = r - 1;
      if (!highlightSet.has(dataRowIndex)) continue;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
          fill: { fgColor: { rgb: 'FEF08A' } },      // yellow highlight
          font: { color: { rgb: '92400E' }, bold: true },
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const cleanName = `${cleanText(filename)}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveDirectToDownloads(
      base64,
      cleanName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } else {
    XLSX.writeFile(wb, cleanName);
  }
};

// ─── PDF ─────────────────────────────────────────────────────────────────
export const exportToPDF = async (data, columns, filename, title, highlightRows = []) => {
  const isLandscape = columns.length > 6;
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait' });
  registerPdfFonts(doc);

  const cleanTitle = cleanDisplay(title || filename);

  doc.setFontSize(16);
  doc.setFont('NotoSans', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('SchoolMS', 14, 14);

  doc.setFontSize(11);
  doc.setFont('NotoSans', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(cleanTitle, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    14, 29
  );

  const highlightSet = new Set(highlightRows);

  autoTable(doc, {
    // NOTE: look cells up by the ORIGINAL label (that is the row key); only the displayed text is cleaned.
    head: [columns.map(c => cleanDisplay(c.label))],
    body: dateOnlyRows(data).map(row => columns.map(c => cleanDisplay(row[c.label] ?? ''))),
    startY: 34,
    styles: { fontSize: 8, cellPadding: 3, font: 'NotoSans', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', font: 'NotoSans' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && highlightSet.has(hookData.row.index)) {
        hookData.cell.styles.fillColor = [254, 240, 138];
        hookData.cell.styles.textColor = [146, 64, 14];
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const cleanName = `${cleanText(filename)}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1];
    await saveDirectToDownloads(base64, cleanName, 'application/pdf');
  } else {
    doc.save(cleanName);
  }
};

// ─── WHATSAPP / shared save helpers — unchanged ───────────────────────────
export const shareOnWhatsApp = (phone, message) => {
  let cleaned = phone?.toString().replace(/\D/g, '') || '';
  if (cleaned.startsWith('0')) cleaned = '91' + cleaned.slice(1);
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

export const saveWorkbook = async (wb, filename) => {
  const cleanName = cleanText(filename);
  if (Capacitor.isNativePlatform()) {
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveDirectToDownloads(
      base64, cleanName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } else {
    XLSX.writeFile(wb, cleanName);
  }
};

export const saveDocument = async (doc, filename) => {
  const cleanName = cleanText(filename);
  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1];
    await saveDirectToDownloads(base64, cleanName, 'application/pdf');
  } else {
    doc.save(cleanName);
  }
};