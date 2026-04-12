import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  referral_code: string | null;
  has_transaction_pin: boolean;
}

type AdminRole = 'super_admin' | 'sub_admin' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminRole: AdminRole;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole>(null);
  const virtualAccountCreationAttempted = useRef<Set<string>>(new Set());

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, phone_number, avatar_url, referral_code, has_transaction_pin, is_agent, kyc_level, daily_transaction_limit, suspended_at, created_at, updated_at")
      .eq("user_id", userId)
      .single();
    
    if (data) {
      setProfile(data);
    }
  };

  const checkAdminRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "moderator"]);
    
    if (data && data.length > 0) {
      const hasAdmin = data.some(r => r.role === 'admin');
      const hasModerator = data.some(r => r.role === 'moderator');
      setIsAdmin(hasAdmin || hasModerator);
      setAdminRole(hasAdmin ? 'super_admin' : hasModerator ? 'sub_admin' : null);
    } else {
      setIsAdmin(false);
      setAdminRole(null);
    }
  };

  const ensureVirtualAccount = async (userId: string, accessToken: string) => {
    // Prevent multiple attempts for the same user in this session
    if (virtualAccountCreationAttempted.current.has(userId)) {
      return;
    }
    virtualAccountCreationAttempted.current.add(userId);

    try {
      // Check if user already has a virtual account
      const { data: existingAccount } = await supabase
        .from("virtual_accounts")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existingAccount) {
        console.log("User already has virtual account");
        return;
      }

      console.log("Creating virtual account for new user...");
      
      // Call the create-virtual-account edge function
      const { data, error } = await supabase.functions.invoke("create-virtual-account", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        console.error("Failed to create virtual account:", error);
        return;
      }

      if (data?.unavailable) {
        console.log("Virtual accounts not available for this business");
        return;
      }

      if (data?.success) {
        console.log("Virtual account created successfully:", data.account?.account_number);
      }
    } catch (error) {
      console.error("Error ensuring virtual account:", error);
    }
  };

  const registerCurrentDevice = async (userId: string) => {
    try {
      let deviceId: string, deviceName: string, deviceModel: string, osVersion: string, platform: string;
      
      if (Capacitor.isNativePlatform()) {
        const idResult = await Device.getId();
        const infoResult = await Device.getInfo();
        deviceId = idResult.identifier;
        deviceName = infoResult.name || `${infoResult.manufacturer} ${infoResult.model}`;
        deviceModel = infoResult.model;
        osVersion = infoResult.osVersion;
        platform = infoResult.platform;
      } else {
        deviceId = localStorage.getItem("inkota_device_id") || crypto.randomUUID();
        localStorage.setItem("inkota_device_id", deviceId);
        deviceName = navigator.platform || "Web Browser";
        deviceModel = "Browser";
        osVersion = "unknown";
        platform = "web";
      }

      // Check if blocked
      const { data: blocked } = await supabase
        .from("trusted_devices")
        .select("id")
        .eq("device_id", deviceId)
        .eq("is_blocked", true)
        .maybeSingle();

      if (blocked) {
        await supabase.auth.signOut();
        return;
      }

      // Deactivate other devices
      await supabase
        .from("trusted_devices")
        .update({ is_active: false })
        .eq("user_id", userId)
        .neq("device_id", deviceId);

      // Upsert current device
      await supabase
        .from("trusted_devices")
        .upsert(
          {
            user_id: userId,
            device_id: deviceId,
            device_name: deviceName,
            device_model: deviceModel,
            os_version: osVersion,
            platform,
            is_active: true,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "user_id,device_id" }
        );
    } catch (error) {
      console.error("Device registration error:", error);
    }
  };

  const processEmailReferral = async (userId: string, accessToken: string) => {
    try {
      const pendingCode = localStorage.getItem("pendingReferralCode");
      if (!pendingCode) return;

      localStorage.removeItem("pendingReferralCode");

      const { error } = await supabase.functions.invoke("process-referral", {
        body: { referralCode: pendingCode },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        console.error("Error processing email referral:", error);
      } else {
        console.log("Email referral processed successfully");
      }
    } catch (error) {
      console.error("Error processing email referral:", error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            checkAdminRole(session.user.id);
            
            // Auto-create virtual account on sign-in (covers both signup and login)
            if (event === "SIGNED_IN") {
              ensureVirtualAccount(session.user.id, session.access_token);
              processEmailReferral(session.user.id, session.access_token);
              registerCurrentDevice(session.user.id);
            }
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        checkAdminRole(session.user.id);
        // Also try to ensure virtual account on page load (for users who signed up before this feature)
        ensureVirtualAccount(session.user.id, session.access_token);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setAdminRole(null);
  };

  const isSuperAdmin = adminRole === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isAdmin,
        isSuperAdmin,
        adminRole,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
