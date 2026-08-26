'use client';

export default function PrintButton({ label = 'Als PDF speichern' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden text-teal-600 text-sm font-semibold hover:text-teal-700 mb-8 ml-4 inline-block"
    >
      {label}
    </button>
  );
}
