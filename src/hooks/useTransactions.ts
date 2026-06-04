import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { readCache, writeCache } from "@/lib/offline-cache";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export interface Transaction {
  id: string;
  user_id: string;
  type: "credit" | "debit";
  amount: number;
  balance_before: number;
  balance_after: number;
  status: "pending" | "success" | "failed";
  description: string | null;
  reference: string | null;
  metadata: unknown;
  created_at: string;
}

interface UseTransactionsOptions {
  startDate?: Date;
  endDate?: Date;
  status?: "pending" | "success" | "failed" | "all";
  limit?: number;
}

const cacheKeyFor = (opts: UseTransactionsOptions) =>
  `transactions:${opts.status || "all"}:${opts.limit || "none"}:${opts.startDate?.toISOString() || ""}:${opts.endDate?.toISOString() || ""}`;

export const useTransactions = (options: UseTransactionsOptions = {}) => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const cacheKey = cacheKeyFor(options);

  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    user ? readCache<Transaction[]>(user.id, cacheKey) || [] : []
  );
  const [isLoading, setIsLoading] = useState(transactions.length === 0);

  // Re-hydrate when user or query changes
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }
    const cached = readCache<Transaction[]>(user.id, cacheKey);
    if (cached) {
      setTransactions(cached);
      setIsLoading(false);
    }
  }, [user, cacheKey]);

  const fetchTransactions = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    // Offline: keep cached list, do not show forever-loading.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsLoading(false);
      return;
    }

    let query = supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (options.startDate) {
      query = query.gte("created_at", options.startDate.toISOString());
    }
    if (options.endDate) {
      query = query.lte("created_at", options.endDate.toISOString());
    }
    if (options.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (!error && data) {
      const mapped = data.map((t) => ({
        ...t,
        amount: parseFloat(t.amount as unknown as string),
        balance_before: parseFloat(t.balance_before as unknown as string),
        balance_after: parseFloat(t.balance_after as unknown as string),
        type: t.type as "credit" | "debit",
        status: t.status as "pending" | "success" | "failed",
      })) as Transaction[];
      setTransactions(mapped);
      writeCache(user.id, cacheKey, mapped);
    }
    setIsLoading(false);
  }, [user, options.startDate, options.endDate, options.status, options.limit, cacheKey]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Auto-refetch when connection returns
  useEffect(() => {
    if (isOnline && user) fetchTransactions();
  }, [isOnline, user, fetchTransactions]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("transactions-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTransactions]);

  return { transactions, isLoading, refetch: fetchTransactions };
};
