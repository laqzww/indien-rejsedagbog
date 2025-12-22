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
      links: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          post_id: string
          site_name: string | null
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          post_id: string
          site_name?: string | null
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          post_id?: string
          site_name?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          captured_at: string | null
          created_at: string
          display_order: number
          exif_data: Json | null
          height: number | null
          id: string
          lat: number | null
          lng: number | null
          mime_type: string | null
          post_id: string
          storage_path: string
          thumbnail_path: string | null
          type: string
          width: number | null
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          display_order?: number
          exif_data?: Json | null
          height?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mime_type?: string | null
          post_id: string
          storage_path: string
          thumbnail_path?: string | null
          type: string
          width?: number | null
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          display_order?: number
          exif_data?: Json | null
          height?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mime_type?: string | null
          post_id?: string
          storage_path?: string
          thumbnail_path?: string | null
          type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          arrival_date: string | null
          created_at: string
          departure_date: string | null
          description: string | null
          display_order: number
          id: string
          lat: number
          lng: number
          name: string
        }
        Insert: {
          arrival_date?: string | null
          created_at?: string
          departure_date?: string | null
          description?: string | null
          display_order?: number
          id?: string
          lat: number
          lng: number
          name: string
        }
        Update: {
          arrival_date?: string | null
          created_at?: string
          departure_date?: string | null
          description?: string | null
          display_order?: number
          id?: string
          lat?: number
          lng?: number
          name?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_id: string
          body: string
          captured_at: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          location_name: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          captured_at?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          captured_at?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_author: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_author?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_author?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for easier use
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Post = Database["public"]["Tables"]["posts"]["Row"];
export type Media = Database["public"]["Tables"]["media"]["Row"];
export type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
export type Link = Database["public"]["Tables"]["links"]["Row"];

// Post with relations
export type PostWithMedia = Post & {
  media: Media[];
  links: Link[];
  profile: Profile | null;
};
