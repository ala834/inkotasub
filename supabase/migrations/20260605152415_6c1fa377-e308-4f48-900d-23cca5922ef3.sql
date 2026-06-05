
REVOKE EXECUTE ON FUNCTION public.atomic_cashback_credit(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_cashback_debit(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_cashback_for_transaction(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_cashback_to_wallet(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_cashback_credit(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_cashback_debit(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_cashback_for_transaction(uuid, uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_cashback_to_wallet(uuid, numeric) TO service_role;
