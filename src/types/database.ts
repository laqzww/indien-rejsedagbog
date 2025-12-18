export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_author: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_author?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          is_author?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          body: string;
          tags: string[] | null;
          lat: number | null;
          lng: number | null;
          location_name: string | null;
          created_at: string;
          captured_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          body: string;
          tags?: string[] | null;
          lat?: number | null;
          lng?: number | null;
          location_name?: string | null;
          created_at?: string;
          captured_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          body?: string;
          tags?: string[] | null;
          lat?: number | null;
          lng?: number | null;
          location_name?: string | null;
          created_at?: string;
          captured_at?: string | null;
          updated_at?: string;
        };
      };
      media: {
        Row: {
          id: string;
          post_id: string;
          storage_path: string;
          type: "image" | "video";
          mime_type: string | null;
          width: number | null;
          height: number | null;
          exif_data: Json | null;
          lat: number | null;
          lng: number | null;
          captured_at: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          storage_path: string;
          type: "image" | "video";
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          exif_data?: Json | null;
          lat?: number | null;
          lng?: number | null;
          captured_at?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          storage_path?: string;
          type?: "image" | "video";
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          exif_data?: Json | null;
          lat?: number | null;
          lng?: number | null;
          captured_at?: string | null;
          display_order?: number;
          created_at?: string;
        };
      };
      milestones: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          lat: number;
          lng: number;
          arrival_date: string | null;
          departure_date: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          lat: number;
          lng: number;
          arrival_date?: string | null;
          departure_date?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          lat?: number;
          lng?: number;
          arrival_date?: string | null;
          departure_date?: string | null;
          display_order?: number;
          created_at?: string;
        };
      };
      links: {
        Row: {
          id: string;
          post_id: string;
          url: string;
          title: string | null;
          description: string | null;
          image_url: string | null;
          site_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          url: string;
          title?: string | null;
          description?: string | null;
          image_url?: string | null;
          site_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          url?: string;
          title?: string | null;
          description?: string | null;
          image_url?: string | null;
          site_name?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
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

