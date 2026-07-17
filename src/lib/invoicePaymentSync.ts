import { FieldPath, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { checkLexofficeInvoicePaid } from './lexoffice';
import { checkSevdeskInvoicePaid } from './sevdesk';

const OPEN_STATUSES = ['offen', 'gesendet', 'mahnung_1', 'mahnung_2'];
const PAGE_SIZE = 100;

type CheckFns = {
  checkLexofficeInvoicePaid: typeof checkLexofficeInvoicePaid;
  checkSevdeskInvoicePaid: typeof checkSevdeskInvoicePaid;
};

export interface SyncResult {
  checked: number;
  updated: number;
  errors: number;
}

export async function runInvoicePaymentSync(
  db: Firestore,
  checkFns: CheckFns = { checkLexofficeInvoicePaid, checkSevdeskInvoicePaid },
): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, updated: 0, errors: 0 };
  const apiKeyCache = new Map<string, { lexofficeApiKey?: string; sevdeskApiKey?: string }>();

  async function getApiKeys(companyId: string) {
    if (apiKeyCache.has(companyId)) return apiKeyCache.get(companyId)!;
    const snap = await db.collection('companies').doc(companyId).collection('private').doc('integrations').get();
    const keys = { lexofficeApiKey: snap.data()?.lexofficeApiKey, sevdeskApiKey: snap.data()?.sevdeskApiKey };
    apiKeyCache.set(companyId, keys);
    return keys;
  }

  let lastDoc: DocumentSnapshot | null = null;

  while (true) {
    let query = db.collection('assignments')
      .where('invoiceStatus', 'in', OPEN_STATUSES)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const companyId = data.companyId as string | undefined;
      const lexId = data.integrationSyncs?.lexoffice?.externalId as string | undefined;
      const sevId = data.integrationSyncs?.sevdesk?.externalId as string | undefined;
      if (!companyId || (!lexId && !sevId)) continue;

      const keys = await getApiKeys(companyId);
      let paidHandled = false;

      if (lexId && keys.lexofficeApiKey) {
        result.checked++;
        const check = await checkFns.checkLexofficeInvoicePaid(lexId, keys.lexofficeApiKey);
        if (!check.ok) result.errors++;
        else if (check.paid) {
          try {
            await doc.ref.update({ invoiceStatus: 'bezahlt' });
            result.updated++;
            paidHandled = true;
          } catch {
            result.errors++;
          }
        }
      }

      if (!paidHandled && sevId && keys.sevdeskApiKey) {
        result.checked++;
        const check = await checkFns.checkSevdeskInvoicePaid(sevId, keys.sevdeskApiKey);
        if (!check.ok) result.errors++;
        else if (check.paid) {
          try {
            await doc.ref.update({ invoiceStatus: 'bezahlt' });
            result.updated++;
          } catch {
            result.errors++;
          }
        }
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return result;
}
