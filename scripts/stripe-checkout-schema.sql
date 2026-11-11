BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id serial PRIMARY KEY,
  stripe_encrypted_secret_key varchar,
  stripe_encrypted_webhook_secret varchar,
  stripe_card boolean DEFAULT true,
  stripe_boleto boolean DEFAULT false,
  stripe_pix boolean DEFAULT false,
  stripe_brl_exchange_rate numeric,
  updated_at timestamptz(3),
  created_at timestamptz(3)
);

ALTER TYPE public.enum_orders_currency ADD VALUE IF NOT EXISTS 'BRL';
ALTER TYPE public.enum_transactions_currency ADD VALUE IF NOT EXISTS 'BRL';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_i_d varchar,
  ADD COLUMN IF NOT EXISTS stripe_checkout_cart_key varchar,
  ADD COLUMN IF NOT EXISTS stripe_checkout_token varchar,
  ADD COLUMN IF NOT EXISTS stripe_checkout_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_stripe_checkout_session_i_d_idx
  ON public.transactions (stripe_checkout_session_i_d);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_stripe_checkout_cart_key_idx
  ON public.transactions (stripe_checkout_cart_key);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_stripe_checkout_token_idx
  ON public.transactions (stripe_checkout_token);

COMMIT;
