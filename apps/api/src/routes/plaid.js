const express = require('express');
const plaidClient = require('../plaidClient');
const { queryAsRole } = require('../db');
const { encrypt } = require('../crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/link-token', requireAuth, async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.userId) },
      client_name: 'iBag',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('link-token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

router.post('/exchange', requireAuth, async (req, res) => {
  try {
    const { public_token } = req.body;
    if (!public_token) {
      return res.status(400).json({ error: 'public_token required' });
    }

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = exchangeRes.data.access_token;
    const itemId = exchangeRes.data.item_id;
    const encryptedToken = encrypt(accessToken);

    const itemResult = await queryAsRole(
      'ibag_app',
      'INSERT INTO plaid_items (user_id, item_id, access_token_encrypted) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, itemId, encryptedToken]
    );
    const plaidItemId = itemResult.rows[0].id;

    const accountsRes = await plaidClient.accountsGet({ access_token: accessToken });
    for (const acct of accountsRes.data.accounts) {
      await queryAsRole(
        'ibag_app',
        `INSERT INTO plaid_accounts
         (plaid_item_id, user_id, account_id, name, mask, type, subtype, current_balance, available_balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          plaidItemId, req.userId, acct.account_id, acct.name, acct.mask,
          acct.type, acct.subtype, acct.balances.current, acct.balances.available,
        ]
      );
    }

    res.json({ ok: true, accounts_linked: accountsRes.data.accounts.length });
  } catch (err) {
    console.error('exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

module.exports = router;
