import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Remove ALL non-ASCII characters from any string
const cleanText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
};

export const exportToExcel = (data, columns, filename) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const colWidths = columns.map(() => ({ wch: 20 }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${cleanText(filename)}.xlsx`);
};

export const exportToPDF = (data, columns, filename, title) => {
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

  doc.save(`${cleanText(filename)}.pdf`);
};

export const shareOnWhatsApp = (phone, message) => {
  const cleaned = phone?.replace(/\D/g, '');
  const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};