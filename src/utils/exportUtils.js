import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Remove ALL non-ASCII characters from any string
const cleanText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
};

// Convert an ArrayBuffer/Uint8Array to a base64 string (chunked to avoid call-stack issues on large files)
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
};

// Saves a file on native Android/iOS via Capacitor Filesystem, then opens the Share sheet
// so the user can save it to Downloads, Drive, WhatsApp, etc.
const saveAndShareNative = async (base64Data, fileName, mimeType) => {
  try {
    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });

    await Share.share({
      title: fileName,
      url: result.uri,
      dialogTitle: 'Save or share file',
    });
  } catch (err) {
    console.error('Native file save failed:', err);
    throw err;
  }
};

export const exportToExcel = async (data, columns, filename) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const colWidths = columns.map(() => ({ wch: 20 }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const cleanName = `${cleanText(filename)}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    // Get the workbook as a base64 string directly (XLSX supports this output type)
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveAndShareNative(
      base64,
      cleanName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } else {
    // Regular browser/web — use the normal download
    XLSX.writeFile(wb, cleanName);
  }
};

export const exportToPDF = async (data, columns, filename, title) => {
  const isLandscape = columns.length > 6;
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait' });

  // Clean ALL text
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
    styles: {
      fontSize: 8,
      cellPadding: 3,
      font: 'helvetica',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
      font: 'helvetica',
    },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  const cleanName = `${cleanText(filename)}.pdf`;

  if (Capacitor.isNativePlatform()) {
    // jsPDF can output a base64 data URI string directly
    const base64 = doc.output('datauristring').split(',')[1];
    await saveAndShareNative(base64, cleanName, 'application/pdf');
  } else {
    doc.save(cleanName);
  }
};

export const shareOnWhatsApp = (phone, message) => {
  const cleaned = phone?.replace(/\D/g, '');
  const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};