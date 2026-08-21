const CLASSIFICATION_VERSION = 'classification_v1';

function classify(transaction, context) {
  const { amount_cents, provider_category, merchant_name, account_type } = transaction;
  const cat = (provider_category || '').toLowerCase();
  const merchant = (merchant_name || '').toLowerCase();

  if (cat.includes('refund') || context.priorPurchaseMatch) {
    return result('REFUND', 0.9, 'category_or_reversal_match');
  }

  if (cat.includes('fee') || /overdraft|late fee|foreign transaction fee|atm fee/.test(merchant)) {
    return result('FEE', 0.9, 'category_or_merchant_pattern');
  }

  if (cat.includes('atm')) {
    return result('ATM_WITHDRAWAL', 0.9, 'category');
  }

  if (account_type === 'loan') {
    return result('LOAN_PAYMENT', 0.85, 'account_type');
  }

  if (account_type === 'credit' && context.isPaymentNotPurchase) {
    return result('CREDIT_CARD_PAYMENT', 0.85, 'account_type_and_direction');
  }

  if (account_type === 'investment' || cat.includes('invest')) {
    return result('INVESTMENT_ACTIVITY', 0.85, 'account_type_or_category');
  }

  if (context.transferMatch) {
    return result(amount_cents < 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT', context.transferConfidence, 'relationship_match');
  }

  if (amount_cents < 0) {
    if (context.incomeSignalMatch) {
      return result('INCOME', context.incomeConfidence, 'recurrence_pattern');
    }
    if (context.incomePhase === 'resolved') {
      return result('UNKNOWN', 0.0, 'income_signal_absent_after_resolution');
    }
    return result('PENDING_INCOME_REVIEW', null, 'awaiting_income_signal_resolution');
  }

  if (amount_cents > 0) {
    return result('PURCHASE', 0.95, 'default_positive_amount');
  }

  return result('UNKNOWN', 0.0, 'no_rule_matched');
}

function result(classification, confidence, evidenceReason) {
  return { classification, classification_version: CLASSIFICATION_VERSION, confidence, evidence: { reason: evidenceReason } };
}

module.exports = { classify, CLASSIFICATION_VERSION };