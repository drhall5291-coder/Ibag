-- Migration: add Plaid tables used by the API
-- Run this as a DB superuser (or via your migration tooling)

CREATE TABLE IF NOT EXISTS plaid_items (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  access_token_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plaid_accounts (
  id bigserial PRIMARY KEY,
  plaid_item_id bigint NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  name text,
  mask text,
  type text,
  subtype text,
  current_balance numeric,
  available_balance numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
