
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accounts": {
                  Row: {
                    "broker": string,"created_at": string,"currency": string,"id": string,"kind": Database["public"]['Enums']["account_kind"],"label": string,"start_balance": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "broker"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"label": string,"start_balance": number,"user_id"?: string
                  }
                  Update: {
                    "broker"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["account_kind"],"label"?: string,"start_balance"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"attachments": {
                  Row: {
                    "bytes": number,"created_at": string,"height": number,"id": string,"path": string,"trade_id": string,"user_id": string,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes": number,"created_at"?: string,"height": number,"id"?: string,"path": string,"trade_id": string,"user_id"?: string,"width": number
                  }
                  Update: {
                    "bytes"?: number,"created_at"?: string,"height"?: number,"id"?: string,"path"?: string,"trade_id"?: string,"user_id"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_trade_id_fkey"
      columns: ["trade_id"]
isOneToOne: false
      referencedRelation: "trades"
      referencedColumns: ["id"]
    }
                  ]
                },"instruments": {
                  Row: {
                    "code": string,"family": Database["public"]['Enums']["instrument_family"],"favored_direction": Database["public"]['Enums']["trade_direction"],"spike_every": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"family": Database["public"]['Enums']["instrument_family"],"favored_direction": Database["public"]['Enums']["trade_direction"],"spike_every": number
                  }
                  Update: {
                    "code"?: string,"family"?: Database["public"]['Enums']["instrument_family"],"favored_direction"?: Database["public"]['Enums']["trade_direction"],"spike_every"?: number
                  }
                  Relationships: [
                    
                  ]
                },"metrics_daily": {
                  Row: {
                    "account_id": string,"compliance_pct": number,"date": string,"gross_loss": number,"gross_profit": number,"losses": number,"max_drawdown": number,"pnl": number,"r_sum": number,"trades": number,"user_id": string,"wins": number,"with_spike_trades": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"compliance_pct"?: number,"date": string,"gross_loss"?: number,"gross_profit"?: number,"losses"?: number,"max_drawdown"?: number,"pnl"?: number,"r_sum"?: number,"trades"?: number,"user_id": string,"wins"?: number,"with_spike_trades"?: number
                  }
                  Update: {
                    "account_id"?: string,"compliance_pct"?: number,"date"?: string,"gross_loss"?: number,"gross_profit"?: number,"losses"?: number,"max_drawdown"?: number,"pnl"?: number,"r_sum"?: number,"trades"?: number,"user_id"?: string,"wins"?: number,"with_spike_trades"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "metrics_daily_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"observations": {
                  Row: {
                    "account_id": string | null,"created_at": string,"id": string,"instrument": string | null,"kind": Database["public"]['Enums']["observation_kind"],"last_seen_at": string,"level": number | null,"note": string,"timeframe": string | null,"times_seen": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string,"id"?: string,"instrument"?: string | null,"kind"?: Database["public"]['Enums']["observation_kind"],"last_seen_at"?: string,"level"?: number | null,"note": string,"timeframe"?: string | null,"times_seen"?: number,"user_id"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string,"id"?: string,"instrument"?: string | null,"kind"?: Database["public"]['Enums']["observation_kind"],"last_seen_at"?: string,"level"?: number | null,"note"?: string,"timeframe"?: string | null,"times_seen"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "observations_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "observations_instrument_fkey"
      columns: ["instrument"]
isOneToOne: false
      referencedRelation: "instruments"
      referencedColumns: ["code"]
    }
                  ]
                },"rule_violations": {
                  Row: {
                    "created_at": string,"id": string,"message": string,"rule_type": Database["public"]['Enums']["rule_type"],"session_id": string,"trade_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"message": string,"rule_type": Database["public"]['Enums']["rule_type"],"session_id": string,"trade_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string,"rule_type"?: Database["public"]['Enums']["rule_type"],"session_id"?: string,"trade_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rule_violations_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rule_violations_trade_id_fkey"
      columns: ["trade_id"]
isOneToOne: false
      referencedRelation: "trades"
      referencedColumns: ["id"]
    }
                  ]
                },"rules": {
                  Row: {
                    "action": Database["public"]['Enums']["rule_action"],"created_at": string,"enabled": boolean,"id": string,"params": NonNullable<Json>,"type": Database["public"]['Enums']["rule_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: Database["public"]['Enums']["rule_action"],"created_at"?: string,"enabled"?: boolean,"id"?: string,"params"?: NonNullable<Json>,"type": Database["public"]['Enums']["rule_type"],"user_id"?: string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["rule_action"],"created_at"?: string,"enabled"?: boolean,"id"?: string,"params"?: NonNullable<Json>,"type"?: Database["public"]['Enums']["rule_type"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sessions": {
                  Row: {
                    "account_id": string,"blocked_reason": string | null,"closed_at": string | null,"created_at": string,"date": string,"followed_plan": boolean | null,"goal_r": number | null,"id": string,"journal": string | null,"mood_before": Database["public"]['Enums']["mood"] | null,"opened_at": string,"planned_minutes": number | null,"read_rules": boolean,"status": Database["public"]['Enums']["session_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"blocked_reason"?: string | null,"closed_at"?: string | null,"created_at"?: string,"date": string,"followed_plan"?: boolean | null,"goal_r"?: number | null,"id"?: string,"journal"?: string | null,"mood_before"?: Database["public"]['Enums']["mood"] | null,"opened_at"?: string,"planned_minutes"?: number | null,"read_rules"?: boolean,"status"?: Database["public"]['Enums']["session_status"],"user_id"?: string
                  }
                  Update: {
                    "account_id"?: string,"blocked_reason"?: string | null,"closed_at"?: string | null,"created_at"?: string,"date"?: string,"followed_plan"?: boolean | null,"goal_r"?: number | null,"id"?: string,"journal"?: string | null,"mood_before"?: Database["public"]['Enums']["mood"] | null,"opened_at"?: string,"planned_minutes"?: number | null,"read_rules"?: boolean,"status"?: Database["public"]['Enums']["session_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"strategies": {
                  Row: {
                    "active": boolean,"context_tf": string,"created_at": string,"entry_tf": string,"id": string,"name": string,"notes": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"context_tf"?: string,"created_at"?: string,"entry_tf"?: string,"id"?: string,"name": string,"notes"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "active"?: boolean,"context_tf"?: string,"created_at"?: string,"entry_tf"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trades": {
                  Row: {
                    "account_id": string,"anxiety": number | null,"checklist": NonNullable<Json>,"closed_at": string | null,"created_at": string,"direction": Database["public"]['Enums']["trade_direction"],"id": string,"in_plan": boolean,"instrument": string,"mood": Database["public"]['Enums']["mood"] | null,"moved_sl": boolean,"note": string | null,"opened_at": string,"outcome": Database["public"]['Enums']["trade_outcome"],"pnl": number,"r_multiple": number,"session_id": string,"stake": number,"strategy_id": string | null,"tp": number | null,"user_id": string,"with_spike": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"anxiety"?: number | null,"checklist"?: NonNullable<Json>,"closed_at"?: string | null,"created_at"?: string,"direction": Database["public"]['Enums']["trade_direction"],"id"?: string,"in_plan"?: boolean,"instrument": string,"mood"?: Database["public"]['Enums']["mood"] | null,"moved_sl"?: boolean,"note"?: string | null,"opened_at"?: string,"outcome": Database["public"]['Enums']["trade_outcome"],"pnl": number,"r_multiple": number,"session_id": string,"stake": number,"strategy_id"?: string | null,"tp"?: number | null,"user_id"?: string,"with_spike": boolean
                  }
                  Update: {
                    "account_id"?: string,"anxiety"?: number | null,"checklist"?: NonNullable<Json>,"closed_at"?: string | null,"created_at"?: string,"direction"?: Database["public"]['Enums']["trade_direction"],"id"?: string,"in_plan"?: boolean,"instrument"?: string,"mood"?: Database["public"]['Enums']["mood"] | null,"moved_sl"?: boolean,"note"?: string | null,"opened_at"?: string,"outcome"?: Database["public"]['Enums']["trade_outcome"],"pnl"?: number,"r_multiple"?: number,"session_id"?: string,"stake"?: number,"strategy_id"?: string | null,"tp"?: number | null,"user_id"?: string,"with_spike"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "trades_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trades_instrument_fkey"
      columns: ["instrument"]
isOneToOne: false
      referencedRelation: "instruments"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "trades_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trades_strategy_id_fkey"
      columns: ["strategy_id"]
isOneToOne: false
      referencedRelation: "strategies"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "pause_phrase": string | null,"psych": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "pause_phrase"?: string | null,"psych"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "pause_phrase"?: string | null,"psych"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"weekly_reviews": {
                  Row: {
                    "answer": string,"created_at": string,"id": string,"updated_at": string,"user_id": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"created_at"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string,"week_start": string
                  }
                  Update: {
                    "answer"?: string,"created_at"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string,"week_start"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "recompute_metrics_daily":
{ Args: { "p_account": string,"p_date": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_kind": "real"|"demo"|"backtest","instrument_family": "boom"|"crash","mood": "tranquilo"|"acelerado"|"cansado","observation_kind": "zona"|"patron"|"nota","rule_action": "warn"|"block","rule_type": "max_trades"|"max_losses"|"max_session_minutes"|"max_risk_pct"|"allowed_hours"|"no_size_increase_after_loss"|"min_gap_seconds"|"max_psych_errors","session_status": "open"|"closed"|"blocked","trade_direction": "buy"|"sell","trade_outcome": "win"|"loss"|"tie"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_kind": ["real", "demo", "backtest"],"instrument_family": ["boom", "crash"],"mood": ["tranquilo", "acelerado", "cansado"],"observation_kind": ["zona", "patron", "nota"],"rule_action": ["warn", "block"],"rule_type": ["max_trades", "max_losses", "max_session_minutes", "max_risk_pct", "allowed_hours", "no_size_increase_after_loss", "min_gap_seconds", "max_psych_errors"],"session_status": ["open", "closed", "blocked"],"trade_direction": ["buy", "sell"],"trade_outcome": ["win", "loss", "tie"]
          }
        }
} as const
