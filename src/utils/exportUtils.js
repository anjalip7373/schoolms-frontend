import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'react-toastify';

// Native plugin: saves a base64 file DIRECTLY to the public Downloads
// folder via Android's MediaStore.Downloads API. No Share sheet, no
// permission popup on Android 10+ (MediaStore writes are always allowed).
// On Android 6-9 it requests WRITE_EXTERNAL_STORAGE once, then never again.
const DownloadSaver = registerPlugin('DownloadSaver');

// Remove ALL non-ASCII characters from any string
const cleanText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
};

// ─── CORE NATIVE SAVE LOGIC ──────────────────────────────────────────────
// Saves straight to /storage/emulated/0/Download — no Share sheet popup.
const saveDirectToDownloads = async (base64Data, fileName, mimeType) => {
  try {
    toast.info(`Saving ${fileName}...`, { autoClose: 2000 });

    await DownloadSaver.saveToDownloads({
      fileName,
      base64Data,
      mimeType,
    });

    toast.success(`Saved to Downloads: ${fileName}`, { autoClose: 4000 });
  } catch (err) {
    console.error(`${fileName} save failed:`, err);
    toast.error(`Save failed: ${err?.message || JSON.stringify(err)}`, { autoClose: 5000 });
  }
};

// ─── EXCEL ───────────────────────────────────────────────────────────────

export const exportToExcel = async (data, columns, filename) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const colWidths = columns.map(() => ({ wch: 20 }));
  ws['!cols'] = colWidths;
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

export const exportToPDF = async (data, columns, filename, title) => {
  const isLandscape = columns.length > 6;
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait' });

  const cleanTitle = cleanText(title || filename);
  const cleanCols = columns.map(c => ({ ...c, label: cleanText(c.label) }));

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('SchoolMS', 14, 14);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(cleanTitle, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    14, 29
  );

  autoTable(doc, {
    head: [cleanCols.map(c => c.label)],
    body: data.map(row =>
      cleanCols.map(c => cleanText(row[c.label] ?? ''))
    ),
    startY: 34,
    styles: { fontSize: 8, cellPadding: 3, font: 'helvetica', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', font: 'helvetica' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  const cleanName = `${cleanText(filename)}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1];
    await saveDirectToDownloads(base64, cleanName, 'application/pdf');
  } else {
    doc.save(cleanName);
  }
};

// ─── WHATSAPP ────────────────────────────────────────────────────────────

export const shareOnWhatsApp = (phone, message) => {
  const cleaned = phone?.replace(/\D/g, '');
  const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

// ─── SHARED NATIVE SAVE HELPERS ─────────────────────────────────────────────
// Used directly by AttendanceReport.js and MarksheetReport.js as drop-in
// replacements for XLSX.writeFile(wb, filename) and doc.save(filename).

/**
 * Drop-in replacement for XLSX.writeFile(wb, filename)
 * Saves directly to Downloads on Android, normal download on web.
 */
export const saveWorkbook = async (wb, filename) => {
  const cleanName = cleanText(filename);
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

/**
 * Drop-in replacement for doc.save(filename)
 * Saves directly to Downloads on Android, normal download on web.
 */
export const saveDocument = async (doc, filename) => {
  const cleanName = cleanText(filename);
  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1];
    await saveDirectToDownloads(base64, cleanName, 'application/pdf');
  } else {
    doc.save(cleanName);
  }
};