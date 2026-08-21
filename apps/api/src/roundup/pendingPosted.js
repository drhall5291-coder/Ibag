const { applyRoundupEvent } = require('./rules');

async function applyRoundupForTransaction(
  client,
  userId,
  accountId,
  transaction,
  evalResult
) {
  if (transaction.pending_transaction_id) {
    const prior = await client.query(
      `SELECT re.id, re.roundup_cents, re.source_amount_cents,
              re.eligibility_status
       FROM transactions pt
       LEFT JOIN roundup_events re
         ON re.transaction_id = pt.id
        AND re.rule_version = $2
       WHERE pt.plaid_transaction_id = $1
       FOR UPDATE OF pt`,
      [transaction.pending_transaction_id, evalResult.rule_version]
    );

    if (prior.rows.length > 0 && prior.rows[0].id) {
      const event = prior.rows[0];

      await client.query(
        `UPDATE roundup_events
            SET transaction_id = $1,
                source_amount_cents = $2,
                roundup_cents = $3,
                eligibility_status = $4,
                eligibility_reason = $5
          WHERE id = $6`,
        [
          transaction.id,
          evalResult.source_amount_cents,
          evalResult.roundup_cents,
          evalResult.eligibility_status,
          evalResult.eligibility_reason,
          event.id,
        ]
      );

      const delta = evalResult.roundup_cents - event.roundup_cents;

      if (delta !== 0) {
        await client.query(
          `INSERT INTO roundup_accumulators (user_id, account_id, total_cents)
           VALUES ($1,$2,$3)
           ON CONFLICT (account_id)
           DO UPDATE SET total_cents =
             roundup_accumulators.total_cents + EXCLUDED.total_cents,
             updated_at = now()`,
          [userId, accountId, delta]
        );
      }

      await client.query(
        `UPDATE roundup_line_items
            SET roundup_cents_snapshot = $1
          WHERE roundup_event_id = $2
            AND batch_id IN (
              SELECT id FROM roundup_batches WHERE status = 'pending'
            )`,
        [evalResult.roundup_cents, event.id]
      );

      return event;
    }
  }

  return applyRoundupEvent(
    client,
    userId,
    accountId,
    transaction.id,
    evalResult
  );
}

module.exports = { applyRoundupForTransaction };