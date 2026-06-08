import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';

async function createPdfFromHtml(html: string): Promise<jsPDF> {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#fff';
  document.body.appendChild(container);

  try {
    const imgs = container.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));
    await document.fonts.ready;

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: container.scrollWidth,
      height: container.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = 210;
    const pdfH = 297;

    const contentW = canvas.width;
    const contentH = canvas.height;
    const pageH = (contentW / pdfW) * pdfH;

    let remaining = contentH;
    let srcY = 0;

    while (remaining > 0) {
      if (srcY > 0) pdf.addPage();
      const sliceH = Math.min(pageH, remaining);
      const canvas2 = document.createElement('canvas');
      canvas2.width = contentW;
      canvas2.height = sliceH;
      const ctx = canvas2.getContext('2d')!;
      ctx.drawImage(canvas, 0, srcY, contentW, sliceH, 0, 0, contentW, sliceH);
      const sliceData = canvas2.toDataURL('image/jpeg', 0.95);
      pdf.addImage(sliceData, 'JPEG', 0, 0, pdfW, sliceH * pdfW / contentW);
      srcY += pageH;
      remaining -= pageH;
    }

    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadPDF(html: string, fileName: string) {
  const pdf = await createPdfFromHtml(html);
  pdf.save(fileName.replace(/\.html$/i, '.pdf'));
}

export async function downloadZugferdPDF(html: string, xml: string, fileName: string) {
  const pdf = await createPdfFromHtml(html);
  const pdfBytes = pdf.output('arraybuffer');

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const xmlBytes = new TextEncoder().encode(xml);

  await pdfDoc.attach(xmlBytes, 'ZUGFeRD-invoice.xml', {
    mimeType: 'application/xml',
    description: 'ZUGFeRD Rechnung',
  });

  const finalBytes = await pdfDoc.save();
  const blob = new Blob([finalBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/\.html$/i, '.pdf');
  a.click();
  URL.revokeObjectURL(url);
}
