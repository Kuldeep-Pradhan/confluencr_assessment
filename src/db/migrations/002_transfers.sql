CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(15, 2) NOT NULL,
  source_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  destination_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  reference_id VARCHAR(96) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_transfer_reference UNIQUE (reference_id),
  CONSTRAINT chk_transfer_amount_positive CHECK (amount > 0.00),
  CONSTRAINT chk_transfer_distinct_accounts CHECK (source_account_id <> destination_account_id),
  CONSTRAINT chk_transfer_reference_non_empty CHECK (char_length(trim(reference_id)) > 0),
  CONSTRAINT chk_transfer_distinct_transactions CHECK (source_transaction_id <> destination_transaction_id)
);
CREATE TRIGGER immutable_transfers BEFORE UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER no_truncate_transfers BEFORE TRUNCATE ON transfers
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();
