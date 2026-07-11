import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  listEndpointKinds,
  createEndpointKind,
  updateEndpointKind,
  deleteEndpointKind,
} from "@/lib/endpointKinds.functions";
import { endpointKindInfo } from "@/lib/endpointKinds";
import {
  Monitor,
  Wifi,
  Cctv,
  Plug,
  PanelTop,
  Container,
  Warehouse,
  Utensils,
  Waves,
  Server,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export type EndpointKindRow = {
  id: string;
  code: string;
  label: string;
  default_reserve_m: number;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
};

const ICONS: Record<string, LucideIcon> = {
  Monitor,
  Wifi,
  Cctv,
  Plug,
  PanelTop,
  Container,
  Warehouse,
  Utensils,
  Waves,
  Server,
  HelpCircle,
};

export const ICON_CHOICES = [
  "Monitor",
  "Wifi",
  "Cctv",
  "Plug",
  "PanelTop",
  "Container",
  "Warehouse",
  "Utensils",
  "Waves",
  "Server",
  "HelpCircle",
];

export function resolveKindIcon(
  name: string | null | undefined,
  codeFallback?: string,
): LucideIcon {
  if (name && ICONS[name]) return ICONS[name];
  if (codeFallback) return endpointKindInfo(codeFallback).icon;
  return HelpCircle;
}

export function resolveKindColor(color: string | null | undefined, codeFallback?: string): string {
  if (color) return color;
  if (codeFallback) return endpointKindInfo(codeFallback).color;
  return "hsl(0 0% 40%)";
}

export function useEndpointKinds(projectId: string | undefined) {
  const fetchFn = useServerFn(listEndpointKinds);
  return useQuery({
    queryKey: ["endpoint-kinds", projectId],
    queryFn: () => fetchFn({ data: { projectId: projectId! } }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useEndpointKindMutations(projectId: string | undefined) {
  const qc = useQueryClient();
  const createFn = useServerFn(createEndpointKind);
  const updateFn = useServerFn(updateEndpointKind);
  const deleteFn = useServerFn(deleteEndpointKind);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["endpoint-kinds", projectId] });
  return {
    create: useMutation({
      mutationFn: (payload: {
        projectId: string;
        code: string;
        label: string;
        defaultReserveM: number;
        color?: string;
        icon?: string;
        sortOrder?: number;
      }) => createFn({ data: payload }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (payload: {
        id: string;
        label?: string;
        defaultReserveM?: number;
        color?: string | null;
        icon?: string | null;
        sortOrder?: number;
      }) => updateFn({ data: payload }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteFn({ data: { id } }),
      onSuccess: invalidate,
    }),
  };
}
