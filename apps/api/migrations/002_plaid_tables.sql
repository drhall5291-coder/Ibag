CREATE TABLE IF NOT EXISTS plaid_items (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plaid_accounts (
  id BIGSERIAL PRIMARY KEY,
  plaid_item_id BIGINT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL UNIQUE,
  name TEXT,
  mask TEXT,
  type TEXT,
  subtype TEXT,
  current_balance NUMERIC,
  available_balance NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user_id ON plaid_accounts(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON plaid_items TO ibag_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON plaid_accounts TO ibag_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ibag_app;
