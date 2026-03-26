// Financial Ledger System
// Immutable audit trail for all financial operations

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type LedgerEntryType = 
  | 'wallet_debit' 
  | 'wallet_credit' 
  | 'provider_charge' 
  | 'profit_margin' 
  | 'refund' 
  | 'admin_adjustment';

interface LedgerEntry {
  transaction_id?: string;
  user_id: string;
  entry_type: LedgerEntryType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference?: string;
  metadata?: Record<string, unknown>;
}

// Record a ledger entry - fire and forget for performance
export function recordLedgerEntry(entry: LedgerEntry): void {
  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    adminSupabase.from("ledger_entries").insert(entry).then(({ error }) => {
      if (error) console.error("Ledger entry failed:", error);
    });
  } catch (e) {
    console.error("Ledger recording error:", e);
  }
}

// Record multiple ledger entries for a single transaction (debit + provider charge + profit)
export function recordTransactionLedger(params: {
  transactionId: string;
  userId: string;
  sellingPrice: number;
  costPrice: number;
  profit: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  serviceType: string;
  provider: string;
}): void {
  const { transactionId, userId, sellingPrice, costPrice, profit, balanceBefore, balanceAfter, reference, serviceType, provider } = params;
  
  try {
    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const entries: LedgerEntry[] = [
      {
        transaction_id: transactionId,
        user_id: userId,
        entry_type: 'wallet_debit',
        amount: sellingPrice,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference,
        metadata: { service_type: serviceType },
      },
      {
        transaction_id: transactionId,
        user_id: userId,
        entry_type: 'provider_charge',
        amount: costPrice,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference,
        metadata: { provider, service_type: serviceType },
      },
    ];

    if (profit > 0) {
      entries.push({
        transaction_id: transactionId,
        user_id: userId,
        entry_type: 'profit_margin',
        amount: profit,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference,
        metadata: { provider, service_type: serviceType, margin_percentage: ((profit / sellingPrice) * 100).toFixed(2) },
      });
    }

    adminSupabase.from("ledger_entries").insert(entries).then(({ error }) => {
      if (error) console.error("Bulk ledger insert failed:", error);
    });
  } catch (e) {
    console.error("Ledger bulk recording error:", e);
  }
}
