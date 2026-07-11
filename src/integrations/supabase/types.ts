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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cable_bundles: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          floor_plan_id: string
          id: string
          is_primary: boolean
          notes: string | null
          points: Json
          project_id: string
          rack_id: string | null
          segments: Json
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          floor_plan_id: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          points?: Json
          project_id: string
          rack_id?: string | null
          segments?: Json
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          floor_plan_id?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          points?: Json
          project_id?: string
          rack_id?: string | null
          segments?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cable_bundles_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_bundles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_bundles_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "racks"
            referencedColumns: ["id"]
          },
        ]
      }
      cable_route_points: {
        Row: {
          created_at: string
          floor_plan_id: string
          id: string
          norm_x: number
          norm_y: number
          project_id: string
          route_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          floor_plan_id: string
          id?: string
          norm_x: number
          norm_y: number
          project_id: string
          route_id: string
          sequence: number
        }
        Update: {
          created_at?: string
          floor_plan_id?: string
          id?: string
          norm_x?: number
          norm_y?: number
          project_id?: string
          route_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "cable_route_points_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_route_points_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_route_points_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "cable_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      cable_routes: {
        Row: {
          created_at: string
          floor_plan_id: string
          from_endpoint_id: string | null
          id: string
          manual_length_m: number | null
          name: string | null
          organization_id: string
          project_id: string
          rack_endpoint_id: string | null
          to_endpoint_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_plan_id: string
          from_endpoint_id?: string | null
          id?: string
          manual_length_m?: number | null
          name?: string | null
          organization_id: string
          project_id: string
          rack_endpoint_id?: string | null
          to_endpoint_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_plan_id?: string
          from_endpoint_id?: string | null
          id?: string
          manual_length_m?: number | null
          name?: string | null
          organization_id?: string
          project_id?: string
          rack_endpoint_id?: string | null
          to_endpoint_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cable_routes_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_routes_from_endpoint_id_fkey"
            columns: ["from_endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_routes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_routes_rack_endpoint_id_fkey"
            columns: ["rack_endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_routes_to_endpoint_id_fkey"
            columns: ["to_endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      cable_types: {
        Row: {
          code: string
          color_hint: string | null
          created_at: string
          default_reserve_m: number
          description: string | null
          id: string
          meters_per_hour: number | null
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          code: string
          color_hint?: string | null
          created_at?: string
          default_reserve_m?: number
          description?: string | null
          id?: string
          meters_per_hour?: number | null
          organization_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          color_hint?: string | null
          created_at?: string
          default_reserve_m?: number
          description?: string | null
          id?: string
          meters_per_hour?: number | null
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cable_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cable_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cables: {
        Row: {
          branch_points: Json | null
          bundle_id: string | null
          cable_type_id: string | null
          code: string
          computed_length_m: number | null
          created_at: string
          created_by: string | null
          from_endpoint_id: string | null
          from_port_id: string | null
          id: string
          notes: string | null
          organization_id: string
          override_length_m: number | null
          project_id: string
          route_id: string | null
          status: Database["public"]["Enums"]["cable_status"]
          to_endpoint_id: string | null
          to_port_id: string | null
          updated_at: string
        }
        Insert: {
          branch_points?: Json | null
          bundle_id?: string | null
          cable_type_id?: string | null
          code: string
          computed_length_m?: number | null
          created_at?: string
          created_by?: string | null
          from_endpoint_id?: string | null
          from_port_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          override_length_m?: number | null
          project_id: string
          route_id?: string | null
          status?: Database["public"]["Enums"]["cable_status"]
          to_endpoint_id?: string | null
          to_port_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_points?: Json | null
          bundle_id?: string | null
          cable_type_id?: string | null
          code?: string
          computed_length_m?: number | null
          created_at?: string
          created_by?: string | null
          from_endpoint_id?: string | null
          from_port_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          override_length_m?: number | null
          project_id?: string
          route_id?: string | null
          status?: Database["public"]["Enums"]["cable_status"]
          to_endpoint_id?: string | null
          to_port_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cables_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "cable_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_cable_type_id_fkey"
            columns: ["cable_type_id"]
            isOneToOne: false
            referencedRelation: "cable_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_from_endpoint_id_fkey"
            columns: ["from_endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_from_port_id_fkey"
            columns: ["from_port_id"]
            isOneToOne: false
            referencedRelation: "patch_ports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "cable_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_to_endpoint_id_fkey"
            columns: ["to_endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_to_port_id_fkey"
            columns: ["to_port_id"]
            isOneToOne: false
            referencedRelation: "patch_ports"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_cable_groups: {
        Row: {
          cable_id: string
          created_at: string
          endpoint_id: string
          id: string
          notes: string | null
          project_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          cable_id: string
          created_at?: string
          endpoint_id: string
          id?: string
          notes?: string | null
          project_id: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          cable_id?: string
          created_at?: string
          endpoint_id?: string
          id?: string
          notes?: string | null
          project_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_cable_groups_cable_id_fkey"
            columns: ["cable_id"]
            isOneToOne: true
            referencedRelation: "cables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_cable_groups_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_cable_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          endpoint_id: string
          id: string
          organization_id: string
          project_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          endpoint_id: string
          id?: string
          organization_id: string
          project_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          endpoint_id?: string
          id?: string
          organization_id?: string
          project_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_comments_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_kinds: {
        Row: {
          code: string
          color: string | null
          created_at: string
          default_reserve_m: number
          icon: string | null
          id: string
          is_system: boolean
          label: string
          organization_id: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          default_reserve_m?: number
          icon?: string | null
          id?: string
          is_system?: boolean
          label: string
          organization_id: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          default_reserve_m?: number
          icon?: string | null
          id?: string
          is_system?: boolean
          label?: string
          organization_id?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_kinds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_kinds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_photos: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          endpoint_id: string
          id: string
          organization_id: string
          project_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          endpoint_id: string
          id?: string
          organization_id: string
          project_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          endpoint_id?: string
          id?: string
          organization_id?: string
          project_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_photos_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoints: {
        Row: {
          code: string
          created_at: string
          custom_attrs: Json
          customer_code: string | null
          description: string | null
          endpoint_kind: Database["public"]["Enums"]["endpoint_kind"]
          floor: string | null
          floor_plan_id: string
          id: string
          label: string | null
          norm_x: number
          norm_y: number
          notes: string | null
          organization_id: string
          project_id: string
          reference_points: Json
          room: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          custom_attrs?: Json
          customer_code?: string | null
          description?: string | null
          endpoint_kind?: Database["public"]["Enums"]["endpoint_kind"]
          floor?: string | null
          floor_plan_id: string
          id?: string
          label?: string | null
          norm_x: number
          norm_y: number
          notes?: string | null
          organization_id: string
          project_id: string
          reference_points?: Json
          room?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          custom_attrs?: Json
          customer_code?: string | null
          description?: string | null
          endpoint_kind?: Database["public"]["Enums"]["endpoint_kind"]
          floor?: string | null
          floor_plan_id?: string
          id?: string
          label?: string | null
          norm_x?: number
          norm_y?: number
          notes?: string | null
          organization_id?: string
          project_id?: string
          reference_points?: Json
          room?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoints_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plan_calibrations: {
        Row: {
          calibrated_at: string
          calibrated_by: string | null
          created_at: string
          floor_plan_id: string
          id: string
          point_a_norm_x: number
          point_a_norm_y: number
          point_b_norm_x: number
          point_b_norm_y: number
          project_id: string
          real_distance_m: number
          updated_at: string
        }
        Insert: {
          calibrated_at?: string
          calibrated_by?: string | null
          created_at?: string
          floor_plan_id: string
          id?: string
          point_a_norm_x: number
          point_a_norm_y: number
          point_b_norm_x: number
          point_b_norm_y: number
          project_id: string
          real_distance_m: number
          updated_at?: string
        }
        Update: {
          calibrated_at?: string
          calibrated_by?: string | null
          created_at?: string
          floor_plan_id?: string
          id?: string
          point_a_norm_x?: number
          point_a_norm_y?: number
          point_b_norm_x?: number
          point_b_norm_y?: number
          project_id?: string
          real_distance_m?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plan_calibrations_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: true
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plan_calibrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          created_at: string
          display_order: number
          document_id: string | null
          id: string
          level: number
          name: string
          organization_id: string
          project_id: string
          published_at: string | null
          published_by: string | null
          published_to_pull: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          document_id?: string | null
          id?: string
          level?: number
          name: string
          organization_id: string
          project_id: string
          published_at?: string | null
          published_by?: string | null
          published_to_pull?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          document_id?: string | null
          id?: string
          level?: number
          name?: string
          organization_id?: string
          project_id?: string
          published_at?: string | null
          published_by?: string | null
          published_to_pull?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          joined_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      patch_panels: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          floor_plan_id: string | null
          id: string
          name: string | null
          notes: string | null
          organization_id: string
          port_count: number
          project_id: string
          rack_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          floor_plan_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          organization_id: string
          port_count?: number
          project_id: string
          rack_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          floor_plan_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          organization_id?: string
          port_count?: number
          project_id?: string
          rack_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patch_panels_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patch_panels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patch_panels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patch_panels_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "racks"
            referencedColumns: ["id"]
          },
        ]
      }
      patch_ports: {
        Row: {
          created_at: string
          id: string
          label: string | null
          panel_id: string
          port_number: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          panel_id: string
          port_number: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          panel_id?: string
          port_number?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patch_ports_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "patch_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patch_ports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          default_organization_id: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          default_organization_id?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          default_organization_id?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_organization_id_fkey"
            columns: ["default_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string | null
          organization_id: string
          page_count: number | null
          project_id: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string | null
          organization_id: string
          page_count?: number | null
          project_id: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string | null
          organization_id?: string
          page_count?: number | null
          project_id?: string
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          joined_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          code: string
          created_at: string
          created_by: string | null
          customer: string | null
          default_cable_type: string | null
          default_endpoint_reserve_m: number | null
          default_handling_factor: number | null
          default_rack_reserve_m: number | null
          default_vertical_allowance_m: number | null
          id: string
          is_demo: boolean
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["project_status"]
          timezone: string
          updated_at: string
          use_compound_panel_port_ids: boolean
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          customer?: string | null
          default_cable_type?: string | null
          default_endpoint_reserve_m?: number | null
          default_handling_factor?: number | null
          default_rack_reserve_m?: number | null
          default_vertical_allowance_m?: number | null
          id?: string
          is_demo?: boolean
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["project_status"]
          timezone?: string
          updated_at?: string
          use_compound_panel_port_ids?: boolean
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer?: string | null
          default_cable_type?: string | null
          default_endpoint_reserve_m?: number | null
          default_handling_factor?: number | null
          default_rack_reserve_m?: number | null
          default_vertical_allowance_m?: number | null
          id?: string
          is_demo?: boolean
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          timezone?: string
          updated_at?: string
          use_compound_panel_port_ids?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pull_tasks: {
        Row: {
          cable_id: string
          created_at: string
          created_by: string | null
          done_at: string | null
          id: string
          notes: string | null
          order_index: number
          organization_id: string
          project_id: string
          spool_group: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cable_id: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          organization_id: string
          project_id: string
          spool_group?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cable_id?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          organization_id?: string
          project_id?: string
          spool_group?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pull_tasks_cable_id_fkey"
            columns: ["cable_id"]
            isOneToOne: false
            referencedRelation: "cables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pull_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pull_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      racks: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          floor_plan_id: string
          id: string
          name: string | null
          notes: string | null
          project_id: string
          updated_at: string
          x: number
          y: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          floor_plan_id: string
          id?: string
          name?: string | null
          notes?: string | null
          project_id: string
          updated_at?: string
          x?: number
          y?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          floor_plan_id?: string
          id?: string
          name?: string | null
          notes?: string | null
          project_id?: string
          updated_at?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "racks_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "racks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          project_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          project_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          project_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_org_member_by_email_tx: {
        Args: { p_email: string; p_organization_id: string }
        Returns: string
      }
      add_project_member_tx: {
        Args: {
          p_project_id: string
          p_role?: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      create_organization_tx: { Args: { p_name: string }; Returns: string }
      create_project_tx: {
        Args: {
          p_address?: string
          p_code: string
          p_customer?: string
          p_is_demo?: boolean
          p_name: string
          p_organization_id: string
          p_timezone?: string
        }
        Returns: string
      }
      has_org_role: {
        Args: {
          _organization_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_project_role: {
        Args: {
          _project_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      remove_org_member_tx: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_project_member_tx: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: undefined
      }
      seed_endpoint_kinds: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      set_org_role_tx: {
        Args: {
          p_grant: boolean
          p_organization_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      set_project_role_tx: {
        Args: {
          p_grant: boolean
          p_project_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      share_org: { Args: { _a: string; _b: string }; Returns: boolean }
      update_project_tx: {
        Args: {
          p_address: string
          p_customer: string
          p_default_cable_type: string
          p_default_endpoint_reserve_m: number
          p_default_handling_factor: number
          p_default_rack_reserve_m: number
          p_default_vertical_allowance_m: number
          p_is_demo: boolean
          p_name: string
          p_project_id: string
          p_status: Database["public"]["Enums"]["project_status"]
          p_use_compound_panel_port_ids: boolean
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "project_manager"
        | "site_lead"
        | "puller"
        | "rack_technician"
        | "test_technician"
        | "viewer"
      cable_status: "PLANNED" | "PULLED" | "TERMINATED" | "TESTED" | "CANCELLED"
      document_kind: "FLOOR_PLAN" | "SCHEMATIC" | "OTHER"
      endpoint_kind:
        | "WORKSTATION"
        | "AP"
        | "CAMERA"
        | "PATCH"
        | "OTHER"
        | "SOCKET"
        | "TRUNK_STRIP"
        | "CEILING"
        | "KIOSK"
        | "OUTDOOR_KIOSK"
        | "OUTDOOR_CABLE"
        | "KITCHEN"
        | "MONITOR"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "archived"
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
      app_role: [
        "admin",
        "project_manager",
        "site_lead",
        "puller",
        "rack_technician",
        "test_technician",
        "viewer",
      ],
      cable_status: ["PLANNED", "PULLED", "TERMINATED", "TESTED", "CANCELLED"],
      document_kind: ["FLOOR_PLAN", "SCHEMATIC", "OTHER"],
      endpoint_kind: [
        "WORKSTATION",
        "AP",
        "CAMERA",
        "PATCH",
        "OTHER",
        "SOCKET",
        "TRUNK_STRIP",
        "CEILING",
        "KIOSK",
        "OUTDOOR_KIOSK",
        "OUTDOOR_CABLE",
        "KITCHEN",
        "MONITOR",
      ],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "archived",
      ],
    },
  },
} as const
