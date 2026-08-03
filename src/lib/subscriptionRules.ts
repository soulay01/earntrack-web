/**
 * Reine Entscheidungsregeln rund um Abos — ohne Firestore, ohne Stripe.
 *
 * Diese Prädikate bestimmen, ob jemand Zugang verliert oder doppelt zahlt.
 * Sie stehen bewusst getrennt vom I/O-Code, damit sie ohne Netzwerk prüfbar
 * sind (siehe tests/subscription-rules.test.mjs).
 */

export interface CompanySubscriptionFields {
  subscriptionStatus?: string | null;
  stripeSubscriptionId?: string | null;
  iapPlatform?: string | null;
  appleOriginalTransactionId?: string | null;
  revenuecatProductId?: string | null;
}

/**
 * Läuft das Abo über einen App-Store?
 *
 * Achtung: Diese Felder werden beim Ablauf eines Store-Abos NICHT geleert.
 * Der Rückgabewert allein sagt also nur "hat mal über den Store gekauft" —
 * für Entscheidungen immer zusammen mit dem Status auswerten.
 */
export function hasIapMarkers(company: CompanySubscriptionFields): boolean {
  return Boolean(
    company.iapPlatform || company.appleOriginalTransactionId || company.revenuecatProductId,
  );
}

/**
 * Darf über die Web-App (Stripe) gekauft werden?
 *
 * Blockiert wird nur, wenn das aktive Abo tatsächlich das Store-Abo ist:
 * aktiv, Store-Marker vorhanden und keine Stripe-Subscription. Wer eine
 * Stripe-Subscription hat, wechselt regulär den Tarif — auch mit alten
 * Store-Markern aus der Vergangenheit.
 */
export function blocksStripeCheckoutDueToIap(company: CompanySubscriptionFields): boolean {
  return company.subscriptionStatus === 'active'
    && hasIapMarkers(company)
    && !company.stripeSubscriptionId;
}

/**
 * Zahlt die Firma gleichzeitig über beide Kanäle?
 *
 * `incoming` ist der Kanal, über den gerade gekauft wurde — geprüft wird
 * jeweils der andere.
 */
export function hasDualSubscription(
  company: CompanySubscriptionFields,
  incoming: 'iap' | 'stripe',
): boolean {
  if (company.subscriptionStatus !== 'active') return false;
  return incoming === 'iap'
    ? Boolean(company.stripeSubscriptionId)
    : hasIapMarkers(company);
}

/**
 * War die Erstattung vollständig?
 *
 * Stripe feuert `charge.refunded` auch bei Teilerstattungen. Nur eine volle
 * Erstattung beendet das Abo — eine Kulanzgutschrift darf weder den Zugang
 * sperren noch die Löschung der Betriebsdaten auslösen.
 */
export function isFullRefund(amountRefunded: unknown, amountCharged: unknown): boolean {
  const refunded = typeof amountRefunded === 'number' ? amountRefunded : 0;
  const charged = typeof amountCharged === 'number' ? amountCharged : 0;
  if (charged <= 0) return false;
  return refunded >= charged;
}
