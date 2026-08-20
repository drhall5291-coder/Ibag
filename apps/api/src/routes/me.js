const express = require('express');
const { queryAsRole } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const result = await queryAsRole(
      'ibag_app',
      `SELECT account_id, name, mask, type, subtype, current_balance, available_balance
       FROM plaid_accounts
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [req.userId]
    );

    const accounts = result.rows;
    const totalBalance = accounts.reduce(
      (sum, a) => sum + (a.current_balance !== null ? Number(a.current_balance) : 0),
      0
    );

    res.json({ accounts, total_balance: totalBalance });
  } catch (err) {
    console.error('overview error:', err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

module.exports = router;
