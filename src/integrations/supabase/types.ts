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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          summary?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bot_actions: {
        Row: {
          attempts: number
          campaign_id: string
          choice: string | null
          claimed_at: string | null
          done_at: string | null
          error: string | null
          id: number
          kind: string
          payload: Json
          persona_id: string
          run_at: string
          status: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          choice?: string | null
          claimed_at?: string | null
          done_at?: string | null
          error?: string | null
          id?: number
          kind: string
          payload?: Json
          persona_id: string
          run_at: string
          status?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          choice?: string | null
          claimed_at?: string | null
          done_at?: string | null
          error?: string | null
          id?: number
          kind?: string
          payload?: Json
          persona_id?: string
          run_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bot_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_actions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "bot_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_campaigns: {
        Row: {
          comments_target: number
          created_at: string
          created_by: string
          delivered_comments: number
          delivered_reactions: number
          delivered_votes: number
          duration_minutes: number
          ends_at: string
          error_message: string | null
          id: string
          jitter: number
          reactions_target: number
          starts_at: string
          status: string
          target_pct_a: number
          tone: string
          topic_id: string
          total_votes: number
          updated_at: string
        }
        Insert: {
          comments_target?: number
          created_at?: string
          created_by: string
          delivered_comments?: number
          delivered_reactions?: number
          delivered_votes?: number
          duration_minutes: number
          ends_at: string
          error_message?: string | null
          id?: string
          jitter?: number
          reactions_target?: number
          starts_at?: string
          status?: string
          target_pct_a: number
          tone?: string
          topic_id: string
          total_votes: number
          updated_at?: string
        }
        Update: {
          comments_target?: number
          created_at?: string
          created_by?: string
          delivered_comments?: number
          delivered_reactions?: number
          delivered_votes?: number
          duration_minutes?: number
          ends_at?: string
          error_message?: string | null
          id?: string
          jitter?: number
          reactions_target?: number
          starts_at?: string
          status?: string
          target_pct_a?: number
          tone?: string
          topic_id?: string
          total_votes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_campaigns_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_campaigns_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_personas: {
        Row: {
          activity: number
          created_at: string
          id: string
          profile_id: string
          tone: string
          verbosity: number
        }
        Insert: {
          activity?: number
          created_at?: string
          id?: string
          profile_id: string
          tone?: string
          verbosity?: number
        }
        Update: {
          activity?: number
          created_at?: string
          id?: string
          profile_id?: string
          tone?: string
          verbosity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_personas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          emoji: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      comment_edits: {
        Row: {
          comment_id: string
          editor_id: string
          id: string
          previous_body: string
          replaced_at: string
        }
        Insert: {
          comment_id: string
          editor_id: string
          id?: string
          previous_body: string
          replaced_at?: string
        }
        Update: {
          comment_id?: string
          editor_id?: string
          id?: string
          previous_body?: string
          replaced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_edits_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
          value: number
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
          value: number
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          dislikes_count: number
          edit_count: number
          edited_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          is_synthetic: boolean
          likes_count: number
          net_score: number | null
          parent_id: string | null
          side: string
          topic_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dislikes_count?: number
          edit_count?: number
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          is_synthetic?: boolean
          likes_count?: number
          net_score?: number | null
          parent_id?: string | null
          side: string
          topic_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dislikes_count?: number
          edit_count?: number
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          is_synthetic?: boolean
          likes_count?: number
          net_score?: number | null
          parent_id?: string | null
          side?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      job_locks: {
        Row: {
          locked_until: string
          name: string
          updated_at: string
        }
        Insert: {
          locked_until: string
          name: string
          updated_at?: string
        }
        Update: {
          locked_until?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          parent_comment_id: string | null
          read_at: string | null
          topic_id: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          parent_comment_id?: string | null
          read_at?: string | null
          topic_id: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          parent_comment_id?: string | null
          read_at?: string | null
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_synthetic: boolean
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          is_synthetic?: boolean
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_synthetic?: boolean
          username?: string
        }
        Relationships: []
      }
      rate_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      topic_tags: {
        Row: {
          tag_id: string
          topic_id: string
        }
        Insert: {
          tag_id: string
          topic_id: string
        }
        Update: {
          tag_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_tags_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_tags_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          category_id: string | null
          choice_a: string
          choice_b: string
          closes_at: string | null
          comments_count: number
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          moderation_note: string | null
          published_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["topic_status"]
          submitted_by: string | null
          title: string
          total_votes: number | null
          trending_score: number
          votes_a: number
          votes_b: number
        }
        Insert: {
          category_id?: string | null
          choice_a: string
          choice_b: string
          closes_at?: string | null
          comments_count?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          moderation_note?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["topic_status"]
          submitted_by?: string | null
          title: string
          total_votes?: number | null
          trending_score?: number
          votes_a?: number
          votes_b?: number
        }
        Update: {
          category_id?: string | null
          choice_a?: string
          choice_b?: string
          closes_at?: string | null
          comments_count?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          moderation_note?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["topic_status"]
          submitted_by?: string | null
          title?: string
          total_votes?: number | null
          trending_score?: number
          votes_a?: number
          votes_b?: number
        }
        Relationships: [
          {
            foreignKeyName: "topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bans: {
        Row: {
          banned_by: string
          created_at: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          reason?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
      votes: {
        Row: {
          choice: string
          created_at: string
          id: string
          is_synthetic: boolean
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          id?: string
          is_synthetic?: boolean
          topic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          id?: string
          is_synthetic?: boolean
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      notification_feed: {
        Row: {
          actor_avatar: string | null
          actor_id: string | null
          actor_name: string | null
          comment_id: string | null
          context_body: string | null
          created_at: string | null
          id: string | null
          kind: Database["public"]["Enums"]["notification_kind"] | null
          parent_comment_id: string | null
          read_at: string | null
          subject_body: string | null
          subject_side: string | null
          topic_id: string | null
          topic_title: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_cards: {
        Row: {
          category_emoji: string | null
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          choice_a: string | null
          choice_b: string | null
          closes_at: string | null
          comments_count: number | null
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_featured: boolean | null
          pct_a: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["topic_status"] | null
          submitted_by: string | null
          tags: string[] | null
          title: string | null
          total_votes: number | null
          trending_score: number | null
          votes_a: number | null
          votes_b: number | null
        }
        Relationships: [
          {
            foreignKeyName: "topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_activity_series: {
        Args: { _days?: number }
        Returns: {
          comment_count: number
          day: string
          signup_count: number
          vote_count: number
        }[]
      }
      admin_campaign_overview: {
        Args: never
        Returns: {
          comments_target: number
          delivered_comments: number
          delivered_reactions: number
          delivered_votes: number
          ends_at: string
          error_message: string
          id: string
          jitter: number
          live_pct_a: number
          next_run_at: string
          pending_actions: number
          reactions_target: number
          real_comments: number
          real_votes: number
          starts_at: string
          status: string
          synthetic_comments: number
          synthetic_votes: number
          target_pct_a: number
          tone: string
          topic_id: string
          topic_title: string
          total_votes: number
        }[]
      }
      admin_comment_feed: {
        Args: {
          _limit?: number
          _only_hidden?: boolean
          _search?: string
          _topic_id?: string
        }
        Returns: {
          author_banned: boolean
          author_id: string
          author_name: string
          body: string
          created_at: string
          dislikes_count: number
          hidden_reason: string
          id: string
          is_hidden: boolean
          is_synthetic: boolean
          likes_count: number
          open_reports: number
          side: string
          topic_id: string
          topic_title: string
        }[]
      }
      admin_dashboard_stats: { Args: never; Returns: Json }
      admin_purge_campaign: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      admin_report_queue: {
        Args: {
          _limit?: number
          _status?: Database["public"]["Enums"]["report_status"]
        }
        Returns: {
          author_banned: boolean
          author_id: string
          author_name: string
          comment_body: string
          comment_dislikes: number
          comment_id: string
          comment_is_hidden: boolean
          comment_likes: number
          comment_side: string
          created_at: string
          reason: string
          report_id: string
          reporter_id: string
          reporter_name: string
          status: Database["public"]["Enums"]["report_status"]
          topic_id: string
          topic_title: string
        }[]
      }
      admin_set_featured: { Args: { _topic_id?: string }; Returns: undefined }
      admin_toggle_featured: {
        Args: { _on?: boolean; _topic_id: string }
        Returns: undefined
      }
      admin_user_directory: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          avatar_url: string
          ban_reason: string
          comments_count: number
          created_at: string
          hidden_comments_count: number
          id: string
          is_admin: boolean
          is_banned: boolean
          reports_against: number
          topics_count: number
          username: string
          votes_count: number
        }[]
      }
      closed_trending_weight: { Args: { _closes_at: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      notify_wanted: {
        Args: { _actor: string; _recipient: string }
        Returns: boolean
      }
      refresh_trending_scores: { Args: never; Returns: undefined }
      resolve_tag_names: { Args: { _names: string[] }; Returns: string[] }
      set_app_setting: {
        Args: { _key: string; _value: string }
        Returns: undefined
      }
      topic_comment_authors: {
        Args: { _topic_id: string }
        Returns: {
          choice: string
          user_id: string
        }[]
      }
      topic_is_closed: { Args: { _topic_id: string }; Returns: boolean }
      topic_ranked_comments: {
        Args: { _per_side?: number; _topic_id: string }
        Returns: {
          body: string
          created_at: string
          dislikes_count: number
          edit_count: number
          edited_at: string
          hidden_reason: string
          id: string
          is_hidden: boolean
          is_synthetic: boolean
          likes_count: number
          net_score: number
          parent_id: string
          side: string
          topic_id: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      notification_kind: "reply" | "like" | "dislike" | "topic_published"
      report_status: "open" | "resolved" | "dismissed"
      topic_status: "pending" | "published" | "rejected"
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
      app_role: ["admin", "user"],
      notification_kind: ["reply", "like", "dislike", "topic_published"],
      report_status: ["open", "resolved", "dismissed"],
      topic_status: ["pending", "published", "rejected"],
    },
  },
} as const
