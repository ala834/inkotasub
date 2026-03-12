export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_activity_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      auth_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          phone_number: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          phone_number?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          phone_number?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      kyc_verifications: {
        Row: {
          address: string | null
          bvn_number: string | null
          bvn_verified: boolean | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          email_verified: boolean
          full_name: string | null
          id: string
          level: Database["public"]["Enums"]["kyc_level"]
          nin_number: string | null
          nin_verified: boolean | null
          phone_verified: boolean
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          selfie_verified: boolean | null
          state: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          bvn_number?: string | null
          bvn_verified?: boolean | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email_verified?: boolean
          full_name?: string | null
          id?: string
          level: Database["public"]["Enums"]["kyc_level"]
          nin_number?: string | null
          nin_verified?: boolean | null
          phone_verified?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          selfie_verified?: boolean | null
          state?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          bvn_number?: string | null
          bvn_verified?: boolean | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email_verified?: boolean
          full_name?: string | null
          id?: string
          level?: Database["public"]["Enums"]["kyc_level"]
          nin_number?: string | null
          nin_verified?: boolean | null
          phone_verified?: boolean
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          selfie_verified?: boolean | null
          state?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          is_verified: boolean
          phone_number: string
          purpose: string
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at: string
          id?: string
          is_verified?: boolean
          phone_number: string
          purpose?: string
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_verified?: boolean
          phone_number?: string
          purpose?: string
        }
        Relationships: []
      }
      price_change_log: {
        Row: {
          admin_id: string
          change_type: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          plan_id: string | null
          pricing_config_id: string | null
        }
        Insert: {
          admin_id: string
          change_type: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          plan_id?: string | null
          pricing_config_id?: string | null
        }
        Update: {
          admin_id?: string
          change_type?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          plan_id?: string | null
          pricing_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_change_log_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "service_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_log_pricing_config_id_fkey"
            columns: ["pricing_config_id"]
            isOneToOne: false
            referencedRelation: "pricing_config"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          network: string | null
          plan_id: string | null
          profit_type: string
          profit_value: number
          service_type: string
          updated_at: string
          user_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          network?: string | null
          plan_id?: string | null
          profit_type?: string
          profit_value?: number
          service_type: string
          updated_at?: string
          user_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          network?: string | null
          plan_id?: string | null
          profit_type?: string
          profit_value?: number
          service_type?: string
          updated_at?: string
          user_type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          daily_transaction_limit: number | null
          failed_pin_attempts: number | null
          full_name: string | null
          id: string
          is_agent: boolean | null
          kyc_level: Database["public"]["Enums"]["kyc_level"] | null
          phone_number: string | null
          pin_locked_until: string | null
          referral_code: string
          suspended_at: string | null
          transaction_pin: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          daily_transaction_limit?: number | null
          failed_pin_attempts?: number | null
          full_name?: string | null
          id?: string
          is_agent?: boolean | null
          kyc_level?: Database["public"]["Enums"]["kyc_level"] | null
          phone_number?: string | null
          pin_locked_until?: string | null
          referral_code?: string
          suspended_at?: string | null
          transaction_pin?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          daily_transaction_limit?: number | null
          failed_pin_attempts?: number | null
          full_name?: string | null
          id?: string
          is_agent?: boolean | null
          kyc_level?: Database["public"]["Enums"]["kyc_level"] | null
          phone_number?: string | null
          pin_locked_until?: string | null
          referral_code?: string
          suspended_at?: string | null
          transaction_pin?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profit_withdrawals: {
        Row: {
          account_name: string
          account_number: string
          admin_id: string
          amount: number
          bank_name: string
          created_at: string
          id: string
          notes: string | null
          processed_at: string | null
          status: string
        }
        Insert: {
          account_name: string
          account_number: string
          admin_id: string
          amount: number
          bank_name: string
          created_at?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          admin_id?: string
          amount?: number
          bank_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      provider_config: {
        Row: {
          created_at: string | null
          fallback_enabled: boolean | null
          fallback_provider: string | null
          id: string
          is_active: boolean | null
          network: string | null
          primary_provider: string
          service_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fallback_enabled?: boolean | null
          fallback_provider?: string | null
          id?: string
          is_active?: boolean | null
          network?: string | null
          primary_provider?: string
          service_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fallback_enabled?: boolean | null
          fallback_provider?: string | null
          id?: string
          is_active?: boolean | null
          network?: string | null
          primary_provider?: string
          service_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_amount: number | null
          reward_percentage: number
          rewarded: boolean
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_id: string
          referrer_id: string
          reward_amount?: number | null
          reward_percentage?: number
          rewarded?: boolean
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_id?: string
          referrer_id?: string
          reward_amount?: number | null
          reward_percentage?: number
          rewarded?: boolean
          status?: string
        }
        Relationships: []
      }
      service_plans: {
        Row: {
          base_price: number
          created_at: string
          id: string
          is_enabled: boolean
          is_manual: boolean
          last_synced_at: string | null
          network: string
          plan_id: string
          plan_name: string
          service_type: string
          updated_at: string
          validity: string | null
        }
        Insert: {
          base_price?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_manual?: boolean
          last_synced_at?: string | null
          network: string
          plan_id: string
          plan_name: string
          service_type: string
          updated_at?: string
          validity?: string | null
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_manual?: boolean
          last_synced_at?: string | null
          network?: string
          plan_id?: string
          plan_name?: string
          service_type?: string
          updated_at?: string
          validity?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          reference: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          biometric_enabled: boolean | null
          block_reason: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          device_id: string
          device_model: string | null
          device_name: string | null
          id: string
          is_active: boolean | null
          is_blocked: boolean | null
          last_used_at: string
          os_version: string | null
          platform: string | null
          user_id: string
        }
        Insert: {
          biometric_enabled?: boolean | null
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          device_id: string
          device_model?: string | null
          device_name?: string | null
          id?: string
          is_active?: boolean | null
          is_blocked?: boolean | null
          last_used_at?: string
          os_version?: string | null
          platform?: string | null
          user_id: string
        }
        Update: {
          biometric_enabled?: boolean | null
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          device_id?: string
          device_model?: string | null
          device_name?: string | null
          id?: string
          is_active?: boolean | null
          is_blocked?: boolean | null
          last_used_at?: string
          os_version?: string | null
          platform?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      virtual_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          created_at: string
          customer_code: string | null
          customer_id: string | null
          dva_id: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          provider: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          created_at?: string
          customer_code?: string | null
          customer_id?: string | null
          dva_id?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          provider?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          created_at?: string
          customer_code?: string | null
          customer_id?: string | null
          dva_id?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          provider?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vtu_orders: {
        Row: {
          amount: number
          api_response: Json | null
          cost_price: number | null
          created_at: string
          fallback_attempted: boolean | null
          fallback_provider: string | null
          fallback_response: Json | null
          id: string
          profit: number | null
          provider: string
          provider_used: string | null
          recipient: string
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          api_response?: Json | null
          cost_price?: number | null
          created_at?: string
          fallback_attempted?: boolean | null
          fallback_provider?: string | null
          fallback_response?: Json | null
          id?: string
          profit?: number | null
          provider: string
          provider_used?: string | null
          recipient: string
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          api_response?: Json | null
          cost_price?: number | null
          created_at?: string
          fallback_attempted?: boolean | null
          fallback_provider?: string | null
          fallback_response?: Json | null
          id?: string
          profit?: number | null
          provider?: string
          provider_used?: string | null
          recipient?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vtu_orders_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          ledger_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          ledger_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          ledger_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhooks_log: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          payload: Json
          processed: boolean | null
          provider: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          provider: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      kyc_level: "level_1" | "level_2" | "level_3"
      kyc_status: "pending" | "approved" | "rejected"
      service_type: "airtime" | "data" | "electricity" | "cable" | "exam_pin"
      transaction_status: "pending" | "success" | "failed"
      transaction_type: "credit" | "debit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      kyc_level: ["level_1", "level_2", "level_3"],
      kyc_status: ["pending", "approved", "rejected"],
      service_type: ["airtime", "data", "electricity", "cable", "exam_pin"],
      transaction_status: ["pending", "success", "failed"],
      transaction_type: ["credit", "debit"],
    },
  },
} as const
