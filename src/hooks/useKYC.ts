import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface KYCVerification {
  id: string;
  user_id: string;
  level: "level_1" | "level_2" | "level_3";
  status: "pending" | "approved" | "rejected";
  phone_verified: boolean;
  email_verified: boolean;
  full_name: string | null;
  date_of_birth: string | null;
  nin_number: string | null;
  nin_verified: boolean | null;
  bvn_number: string | null;
  bvn_verified: boolean | null;
  selfie_url: string | null;
  selfie_verified: boolean | null;
  address: string | null;
  city: string | null;
  state: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

const KYC_LIMITS = {
  level_1: 50000,
  level_2: 200000,
  level_3: 1000000,
};

export const useKYC = () => {
  const { user, profile } = useAuth();
  const [verifications, setVerifications] = useState<KYCVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentLevel, setCurrentLevel] = useState<"level_1" | "level_2" | "level_3">("level_1");

  const fetchVerifications = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("kyc_verifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (data) {
        setVerifications(data as unknown as KYCVerification[]);
        // Determine current approved level
        const approved = data.filter((v: any) => v.status === "approved");
        if (approved.find((v: any) => v.level === "level_3")) setCurrentLevel("level_3");
        else if (approved.find((v: any) => v.level === "level_2")) setCurrentLevel("level_2");
        else setCurrentLevel("level_1");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVerifications();
  }, [user]);

  const getVerification = (level: string) => verifications.find((v) => v.level === level);
  const getDailyLimit = () => KYC_LIMITS[currentLevel];

  const submitLevel1 = async () => {
    if (!user) return;
    const { error } = await supabase.from("kyc_verifications").upsert(
      {
        user_id: user.id,
        level: "level_1" as any,
        status: "approved" as any,
        phone_verified: !!profile?.phone_number,
        email_verified: !!user.email,
      },
      { onConflict: "user_id,level" }
    );
    if (!error) {
      await supabase
        .from("profiles")
        .update({ kyc_level: "level_1" as any, daily_transaction_limit: 50000 })
        .eq("user_id", user.id);
      await fetchVerifications();
    }
    return { error };
  };

  const submitLevel2 = async (data: { fullName: string; dateOfBirth: string; ninNumber: string }) => {
    if (!user) return;
    const { error } = await supabase.from("kyc_verifications").upsert(
      {
        user_id: user.id,
        level: "level_2" as any,
        status: "pending" as any,
        full_name: data.fullName,
        date_of_birth: data.dateOfBirth,
        nin_number: data.ninNumber,
        phone_verified: true,
        email_verified: true,
      },
      { onConflict: "user_id,level" }
    );
    if (!error) await fetchVerifications();
    return { error };
  };

  const submitLevel3 = async (data: {
    bvnNumber: string;
    selfieUrl: string;
    address: string;
    city: string;
    state: string;
  }) => {
    if (!user) return;
    const { error } = await supabase.from("kyc_verifications").upsert(
      {
        user_id: user.id,
        level: "level_3" as any,
        status: "pending" as any,
        bvn_number: data.bvnNumber,
        selfie_url: data.selfieUrl,
        address: data.address,
        city: data.city,
        state: data.state,
        phone_verified: true,
        email_verified: true,
      },
      { onConflict: "user_id,level" }
    );
    if (!error) await fetchVerifications();
    return { error };
  };

  return {
    verifications,
    isLoading,
    currentLevel,
    getVerification,
    getDailyLimit,
    submitLevel1,
    submitLevel2,
    submitLevel3,
    refresh: fetchVerifications,
  };
};
