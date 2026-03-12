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
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
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
  const virtualAccountCreationAttempted = useRef<Set<string>>(new Set());

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
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
      .eq("role", "admin")
      .single();
    
    setIsAdmin(!!data);
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
              // Process any pending referral code from email signup
              processEmailReferral(session.user.id, session.access_token);
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
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isAdmin,
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
