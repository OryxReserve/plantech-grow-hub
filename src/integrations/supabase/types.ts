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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_members: {
        Row: {
          account_id: string
          created_at: string
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["account_member_role"]
          status: Database["public"]["Enums"]["account_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["account_member_role"]
          status?: Database["public"]["Enums"]["account_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["account_member_role"]
          status?: Database["public"]["Enums"]["account_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          billing_email: string | null
          created_at: string
          created_by: string | null
          email_fallback_enabled: boolean
          id: string
          is_personal: boolean
          name: string
          reminder_hour: number
          stripe_customer_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          email_fallback_enabled?: boolean
          id?: string
          is_personal?: boolean
          name: string
          reminder_hour?: number
          stripe_customer_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          email_fallback_enabled?: boolean
          id?: string
          is_personal?: boolean
          name?: string
          reminder_hour?: number
          stripe_customer_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          account_id: string
          cost_usd: number | null
          created_at: string
          credits_used: number
          feature: string
          id: string
          latency_ms: number | null
          model: string | null
          plant_id: string | null
          provider: string
          status: string
          summarized_payload: Json
          tokens_in: number
          tokens_out: number
          user_id: string | null
        }
        Insert: {
          account_id: string
          cost_usd?: number | null
          created_at?: string
          credits_used?: number
          feature: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          plant_id?: string | null
          provider?: string
          status?: string
          summarized_payload?: Json
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Update: {
          account_id?: string
          cost_usd?: number | null
          created_at?: string
          credits_used?: number
          feature?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          plant_id?: string | null
          provider?: string
          status?: string
          summarized_payload?: Json
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reminder_sent: {
        Row: {
          account_id: string
          created_at: string
          delivered_count: number
          id: string
          local_date: string
          task_count: number
        }
        Insert: {
          account_id: string
          created_at?: string
          delivered_count?: number
          id?: string
          local_date: string
          task_count?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          delivered_count?: number
          id?: string
          local_date?: string
          task_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "care_reminder_sent_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_secrets: {
        Row: {
          created_at: string
          name: string
          secret: string
        }
        Insert: {
          created_at?: string
          name: string
          secret: string
        }
        Update: {
          created_at?: string
          name?: string
          secret?: string
        }
        Relationships: []
      }
      plant_care_log: {
        Row: {
          account_id: string
          care_type: Database["public"]["Enums"]["care_log_type"]
          created_at: string
          id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          plant_id: string
        }
        Insert: {
          account_id: string
          care_type: Database["public"]["Enums"]["care_log_type"]
          created_at?: string
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          plant_id: string
        }
        Update: {
          account_id?: string
          care_type?: Database["public"]["Enums"]["care_log_type"]
          created_at?: string
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          plant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_care_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plant_care_log_plant_id_account_id_fkey"
            columns: ["plant_id", "account_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      plant_care_profile: {
        Row: {
          account_id: string
          context_note: string | null
          created_at: string
          drainage: string | null
          environment: string | null
          fertilizer_type: string | null
          fertilizing_interval_days: number | null
          fertilizing_note: string | null
          id: string
          last_watered_at: string | null
          light_exposure: string | null
          light_note: string | null
          perceived_light: string | null
          plant_id: string
          pot_size_cm: number | null
          soil_type: string | null
          updated_at: string
          watering_amount_note: string | null
          watering_interval_days: number | null
          window_distance_cm: number | null
          window_orientation: string | null
        }
        Insert: {
          account_id: string
          context_note?: string | null
          created_at?: string
          drainage?: string | null
          environment?: string | null
          fertilizer_type?: string | null
          fertilizing_interval_days?: number | null
          fertilizing_note?: string | null
          id?: string
          last_watered_at?: string | null
          light_exposure?: string | null
          light_note?: string | null
          perceived_light?: string | null
          plant_id: string
          pot_size_cm?: number | null
          soil_type?: string | null
          updated_at?: string
          watering_amount_note?: string | null
          watering_interval_days?: number | null
          window_distance_cm?: number | null
          window_orientation?: string | null
        }
        Update: {
          account_id?: string
          context_note?: string | null
          created_at?: string
          drainage?: string | null
          environment?: string | null
          fertilizer_type?: string | null
          fertilizing_interval_days?: number | null
          fertilizing_note?: string | null
          id?: string
          last_watered_at?: string | null
          light_exposure?: string | null
          light_note?: string | null
          perceived_light?: string | null
          plant_id?: string
          pot_size_cm?: number | null
          soil_type?: string | null
          updated_at?: string
          watering_amount_note?: string | null
          watering_interval_days?: number | null
          window_distance_cm?: number | null
          window_orientation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plant_care_profile_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plant_care_profile_plant_id_account_id_fkey"
            columns: ["plant_id", "account_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      plant_photos: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_primary: boolean
          plant_id: string
          storage_path: string
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          plant_id: string
          storage_path: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          plant_id?: string
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plant_photos_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plant_photos_plant_id_account_id_fkey"
            columns: ["plant_id", "account_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      plants: {
        Row: {
          account_id: string
          acquired_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          location: string | null
          nickname: string
          notes: string | null
          scientific_name: string | null
          species_name: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          acquired_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          location?: string | null
          nickname: string
          notes?: string | null
          scientific_name?: string | null
          species_name?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          acquired_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          location?: string | null
          nickname?: string
          notes?: string | null
          scientific_name?: string | null
          species_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          account_id: string
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_archived: boolean
          name: string
          notes: string | null
          npk: string | null
          quantity: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_archived?: boolean
          name: string
          notes?: string | null
          npk?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          notes?: string | null
          npk?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          preferred_language: Database["public"]["Enums"]["app_language"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          preferred_language?: Database["public"]["Enums"]["app_language"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          preferred_language?: Database["public"]["Enums"]["app_language"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          account_id: string
          created_at: string
          fcm_token: string
          id: string
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          fcm_token: string
          id?: string
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          fcm_token?: string
          id?: string
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_run_log: {
        Row: {
          accounts_considered: number
          accounts_notified: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          push_failed: number
          push_sent: number
          stale_tokens_removed: number
          started_at: string
          triggered_manually: boolean
        }
        Insert: {
          accounts_considered?: number
          accounts_notified?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          push_failed?: number
          push_sent?: number
          stale_tokens_removed?: number
          started_at?: string
          triggered_manually?: boolean
        }
        Update: {
          accounts_considered?: number
          accounts_notified?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          push_failed?: number
          push_sent?: number
          stale_tokens_removed?: number
          started_at?: string
          triggered_manually?: boolean
        }
        Relationships: []
      }
      species_care_guide: {
        Row: {
          created_at: string
          fertilizing: string | null
          generated_at: string | null
          id: string
          language: string
          light: string | null
          model: string | null
          notes: string | null
          scientific_name: string
          source: string
          species_key: string
          updated_at: string
          water: string | null
        }
        Insert: {
          created_at?: string
          fertilizing?: string | null
          generated_at?: string | null
          id?: string
          language: string
          light?: string | null
          model?: string | null
          notes?: string | null
          scientific_name: string
          source?: string
          species_key: string
          updated_at?: string
          water?: string | null
        }
        Update: {
          created_at?: string
          fertilizing?: string | null
          generated_at?: string | null
          id?: string
          language?: string
          light?: string | null
          model?: string | null
          notes?: string | null
          scientific_name?: string
          source?: string
          species_key?: string
          updated_at?: string
          water?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_account: { Args: { _account_id: string }; Returns: boolean }
      has_account_role: {
        Args: {
          _account_id: string
          _role: Database["public"]["Enums"]["account_member_role"]
        }
        Returns: boolean
      }
      is_account_member: { Args: { _account_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      list_accounts_due_for_reminder: {
        Args: never
        Returns: {
          account_id: string
          local_date: string
          timezone: string
        }[]
      }
    }
    Enums: {
      account_member_role: "owner" | "admin" | "member"
      account_member_status: "invited" | "active" | "suspended"
      app_language: "pt" | "en" | "es"
      care_log_type:
        | "watering"
        | "fertilizing"
        | "pruning"
        | "repotting"
        | "treatment"
        | "note"
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
      account_member_role: ["owner", "admin", "member"],
      account_member_status: ["invited", "active", "suspended"],
      app_language: ["pt", "en", "es"],
      care_log_type: [
        "watering",
        "fertilizing",
        "pruning",
        "repotting",
        "treatment",
        "note",
      ],
    },
  },
} as const
