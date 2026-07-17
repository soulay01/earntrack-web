import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from './firebase';

// Lager-Abgleich (identisch zur Mobile-App): Mengendifferenz je Artikel als Entnahme
// (mehr) bzw. Rückbuchung (weniger) verbuchen. Das materialien-Array ist bereits
// komplett am Termin gespeichert – hier werden nur Bestand + Bewegungen gebucht.
// Gibt Warnungen zurück (z. B. Bestand würde negativ) – der Termin-Save bleibt gültig.
export async function reconcileAssignmentStock(opts: {
  companyId: string;
  userId: string;
  userEmail?: string;
  prev: any[];
  next: any[];
  assignment: { id: string | null; kunde?: string; projekt?: string };
}): Promise<string[]> {
  const { companyId, userId, userEmail, prev, next, assignment } = opts;
  if (!companyId || !userId || !assignment.id) return [];

  const qtyByItem = (list: any[]) => list.reduce((m: Record<string, number>, x: any) => {
    if (x?.itemId) m[x.itemId] = (m[x.itemId] || 0) + (Number(x.qty) || 0);
    return m;
  }, {});
  const prevQty = qtyByItem(Array.isArray(prev) ? prev : []);
  const nextQty = qtyByItem(Array.isArray(next) ? next : []);
  const warnings: string[] = [];

  for (const itemId of new Set([...Object.keys(prevQty), ...Object.keys(nextQty)])) {
    const diff = (nextQty[itemId] || 0) - (prevQty[itemId] || 0);
    if (!diff) continue;
    try {
      const snap = await getDoc(doc(db, 'inventory_items', itemId));
      if (!snap.exists()) continue; // Artikel inzwischen gelöscht – nur am Termin geführt
      const item: any = snap.data();
      if ((item.quantity || 0) - diff < 0) {
        warnings.push(`${item.name || itemId}: Bestand kann nicht negativ werden`);
        continue;
      }
      await updateDoc(doc(db, 'inventory_items', itemId), { quantity: increment(-diff), updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'inventory_movements'), {
        companyId, itemId, itemName: item.name || '', delta: -diff,
        unit: item.unit || 'Stk', unitPrice: item.price || 0,
        reason: diff > 0 ? 'Entnahme (Termin)' : 'Rückbuchung (Termin)',
        assignmentId: assignment.id,
        assignmentLabel: [assignment.kunde, assignment.projekt].filter(Boolean).join(' – ') || assignment.id,
        userId, userName: userEmail || '', createdAt: serverTimestamp(),
      });
    } catch (e) {
      warnings.push(itemId + ': ' + (e instanceof Error ? e.message : 'Fehler beim Buchen'));
    }
  }
  return warnings;
}
