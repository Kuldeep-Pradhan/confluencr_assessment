CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_account_name_non_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT chk_account_balance_non_negative CHECK (balance >= 0.00)
);
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  type VARCHAR(10) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  reference_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_transaction_type CHECK (type IN ('credit', 'debit')),
  CONSTRAINT chk_transaction_amount_positive CHECK (amount > 0.00),
  CONSTRAINT chk_transaction_reference_non_empty CHECK (char_length(trim(reference_id)) > 0),
  CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
);
CREATE INDEX idx_transactions_account_created ON transactions (account_id, created_at DESC, id DESC);
CREATE INDEX idx_transactions_account_type_created ON transactions (account_id, type, created_at DESC, id DESC);

-- Defense in depth: the API also exposes no ledger update/delete routes.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger records are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER immutable_transactions BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER no_truncate_transactions BEFORE TRUNCATE ON transactions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();
