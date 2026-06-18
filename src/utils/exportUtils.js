import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from 'react-toastify';

// Remove ALL non-ASCII characters from any string
const cleanText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
};

// Saves a file on native Android/iOS via Capacitor Filesystem, then opens the Share sheet
const saveAndShareNative = async (base64Data, fileName, mimeType) => {
  try {
    toast.info(`Preparing ${fileName}...`, { autoClose: 2000 });

    // Write file to Cache directory (no storage permissions needed on any Android version)
    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true,
    });

    // Get the content:// URI so other apps (Files, Drive, WhatsApp) can open it
    const uriResult = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Cache,
    });

    toast.success(`File ready! Opening share sheet...`, { autoClose: 2000 });

    // Share sheet lets the user choose: Save to Downloads, Drive, WhatsApp, etc.
    await Share.share({
      title: fileName,
      text: `SchoolMS export: ${fileName}`,
      url: uriResult.uri,
      dialogTitle: 'Save or share file',
    });

  } catch (err) {
    console.error('saveAndShareNative failed:', err);
    // Show full error so it is impossible to miss
    alert(`Export failed.\n\nFile: ${fileName}\nError: ${err?.message || JSON.stringify(err)}\n\nCheck Android Logcat for details.`);
  }
};

export const exportToExcel = async (data, columns, filename) => {
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = columns.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const cleanName = `${cleanText(filename)}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    // Write as base64 and share natively
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await saveAndShareNative(
      base64,
      cleanName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } else {
    // Web/browser — normal download
    XLSX.writeFile(wb, cleanName);
  }
};

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
    body: data.map(row => cleanCols.map(c => cleanText(row[c.label] ?? ''))),
    startY: 34,
    styles: { fontSize: 8, cellPadding: 3, font: 'helvetica', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', font: 'helvetica' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 14, right: 14 },
  });

  const cleanName = `${cleanText(filename)}.pdf`;

  if (Capacitor.isNativePlatform()) {
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