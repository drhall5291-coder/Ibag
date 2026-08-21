const RULE_VERSION = 'ROUNDUP_STANDARD_V1';
const ROUNDUP_MAX_ELIGIBLE_CENTS = 80000;

const INELIGIBLE_CLASSIFICATIONS = new Set([
  'REFUND', 'INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE',
  'LOAN_PAYMENT', 'CREDIT_CARD_PAYMENT', 'ATM_WITHDRAWAL',
  'CASH_DEPOSIT', 'INVESTMENT_ACTIVITY', 'UNKNOWN',
  'PENDING_INCOME_REVIEW',
]);

function evaluateRoundup(transaction, classification) {
  const { amount_cents, pending } = transaction;

  if (pending) return ineligible(transaction, 'pending');
  if (amount_cents <= 0) return ineligible(transaction, 'non_positive_amount');
  if (amount_cents >= ROUNDUP_MAX_ELIGIBLE_CENTS) return ineligible(transaction, 'above_threshold');
  if (INELIGIBLE_CLASSIFICATIONS.has(classification)) return ineligible(transaction, classification.toLowerCase());

  const roundupCents = (100 - (amount_cents % 100)) % 100;
  return {
    rule_version: RULE_VERSION,
    source_amount_cents: amount_cents,
    roundup_cents: roundupCents,
    eligibility_status: 'eligible',
    eligibility_reason: roundupCents === 0 ? 'whole_dollar' : 'eligible',
  };
}

function ineligible(transaction, reason) {
  return {
    rule_version: RULE_VERSION,
    source_amount_cents: transaction.amount_cents,
    roundup_cents: 0,
    eligibility_status: 'ineligible',
    eligibility_reason: reason,
  };
}

async function applyRoundupEvent(client, userId, accountId, transactionId, evalResult) {
  const insert = await client.query(
    `INSERT INTO roundup_events
       (user_id, transaction_id, rule_version, source_amount_cents, roundup_cents,
        eligibility_status, eligibility_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (transaction_id, rule_version) DO NOTHING
     RETURNING id, roundup_cents`,
    [userId, transactionId, evalResult.rule_version, evalResult.source_amount_cents,
     evalResult.roundup_cents, evalResult.eligibility_status, evalResult.eligibility_reason]
  );

  if (insert.rows.length === 0) return null;

  const event = insert.rows[0];
  if (evalResult.eligibility_status === 'eligible' && event.roundup_cents > 0) {
    const accumulator = await client.query(
      `INSERT INTO roundup_accumulators (user_id, account_id, total_cents)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE
         SET total_cents = roundup_accumulators.total_cents + $3, updated_at = now()
       RETURNING id`,
      [userId, accountId, event.roundup_cents]
    );
    await addToOpenBatch(client, userId, accumulator.rows[0].id, event.id);
  }
  return event;
}

async function applyRoundupCorrection(
  client, userId, originalEventId, accountId,
  oldSourceCents, newSourceCents, oldCents, newCents,
  newEligibilityStatus, newEligibilityReason, reason
) {
  await client.query(
    `INSERT INTO roundup_corrections
       (original_event_id, reason, old_source_amount_cents, new_source_amount_cents,
        old_roundup_cents, new_roundup_cents)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [originalEventId, reason, oldSourceCents, newSourceCents, oldCents, newCents]
  );

  await client.query(
    `UPDATE roundup_events
        SET source_amount_cents = $1,
            roundup_cents = $2,
            eligibility_status = $3,
            eligibility_reason = $4
      WHERE id = $5`,
    [newSourceCents, newCents, newEligibilityStatus, newEligibilityReason, originalEventId]
  );

  const delta = newCents - oldCents;
  let dataQualityFlag = null;

  if (delta !== 0) {
    await client.query(
      `INSERT INTO roundup_accumulators (user_id, account_id, total_cents)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE
         SET total_cents = roundup_accumulators.total_cents + $3, updated_at = now()`,
      [userId, accountId, delta]
    );
  }

  const lineItem = await client.query(
    `SELECT rli.id, rb.id AS batch_id, rb.status
     FROM roundup_line_items rli JOIN roundup_batches rb ON rb.id = rli.batch_id
     WHERE rli.roundup_event_id = $1`,
    [originalEventId]
  );
  const existing = lineItem.rows[0] || null;

  if (newEligibilityStatus === 'eligible' && !existing) {
    const accumulator = await client.query(
      `SELECT id FROM roundup_accumulators WHERE account_id = $1`, [accountId]
    );
    if (accumulator.rows.length > 0) {
      await addToOpenBatch(client, userId, accumulator.rows[0].id, originalEventId);
    }
  } else if (newEligibilityStatus !== 'eligible' && existing) {
    if (existing.status === 'pending') {
      await client.query(`DELETE FROM roundup_line_items WHERE id = $1`, [existing.id]);
      await recomputeBatchTotal(client, existing.batch_id);
    } else {
      dataQualityFlag = {
        issueType: 'roundup_correction_against_closed_batch',
        entityType: 'roundup_batch',
        entityId: existing.batch_id,
        details: { roundupEventId: originalEventId, oldCents, newCents, newEligibilityStatus },
      };
    }
  } else if (newEligibilityStatus === 'eligible' && existing && delta !== 0) {
    if (existing.status === 'pending') {
      await recomputeBatchTotal(client, existing.batch_id);
    } else {
      dataQualityFlag = {
        issueType: 'roundup_correction_against_closed_batch',
        entityType: 'roundup_batch',
        entityId: existing.batch_id,
        details: { roundupEventId: originalEventId, oldCents, newCents, newEligibilityStatus },
      };
    }
  }

  return { dataQualityFlag };
}

async function recomputeBatchTotal(client, batchId) {
  await client.query(
    `UPDATE roundup_batches SET total_cents = (
       SELECT COALESCE(SUM(rli.roundup_cents_snapshot), 0)
       FROM roundup_line_items rli
       WHERE rli.batch_id = $1
     ) WHERE id = $1`,
    [batchId]
  );
}

async function addToOpenBatch(client, userId, accumulatorId, roundupEventId) {
  const existing = await client.query(
    `SELECT id FROM roundup_batches
     WHERE accumulator_id = $1 AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [accumulatorId]
  );

  let batchId;
  if (existing.rows.length > 0) {
    batchId = existing.rows[0].id;
  } else {
    const created = await client.query(
      `INSERT INTO roundup_batches (user_id, accumulator_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, accumulatorId]
    );
    if (created.rows.length > 0) {
      batchId = created.rows[0].id;
    } else {
      const raced = await client.query(
        `SELECT id FROM roundup_batches
         WHERE accumulator_id = $1 AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        [accumulatorId]
      );
      if (raced.rows.length === 0) throw new Error('ROUNDUP_BATCH_CREATE_RACE');
      batchId = raced.rows[0].id;
    }
  }

  await client.query(
    `INSERT INTO roundup_line_items (batch_id, roundup_event_id, roundup_cents_snapshot)
     SELECT $1, id, roundup_cents
     FROM roundup_events
     WHERE id = $2
     ON CONFLICT (roundup_event_id) DO NOTHING`,
    [batchId, roundupEventId]
  );

  await recomputeBatchTotal(client, batchId);

  return batchId;
}

async function closeBatch(client, accumulatorId) {
  const result = await client.query(
    `UPDATE roundup_batches SET status = 'closed', closed_at = now()
     WHERE accumulator_id = $1 AND status = 'pending'
     RETURNING id, total_cents`,
    [accumulatorId]
  );
  return result.rows[0] || null;
}

module.exports = {
  evaluateRoundup, applyRoundupEvent, applyRoundupCorrection,
  addToOpenBatch, closeBatch, recomputeBatchTotal,
  RULE_VERSION, ROUNDUP_MAX_ELIGIBLE_CENTS,
};