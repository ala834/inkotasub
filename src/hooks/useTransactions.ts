import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

export const useTransactions = (options: UseTransactionsOptions = {}) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    if (!user) {
      setTransactions([]);
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
      setTransactions(
        data.map((t) => ({
          ...t,
          amount: parseFloat(t.amount as unknown as string),
          balance_before: parseFloat(t.balance_before as unknown as string),
          balance_after: parseFloat(t.balance_after as unknown as string),
          type: t.type as "credit" | "debit",
          status: t.status as "pending" | "success" | "failed",
        }))
      );
    }
    setIsLoading(false);
  }, [user, options.startDate, options.endDate, options.status, options.limit]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

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
