// Katalog druhů koncových bodů (fyzická umístění zásuvky/zařízení).
// Používá se v editoru plánu, seznamu endpointů i v režimu tahání.

import {
  Monitor,
  Wifi,
  Cctv,
  Cable,
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

export type EndpointKind =
  | "WORKSTATION"
  | "AP"
  | "CAMERA"
  | "PATCH"
  | "SOCKET"
  | "TRUNK_STRIP"
  | "CEILING"
  | "KIOSK"
  | "OUTDOOR_KIOSK"
  | "OUTDOOR_CABLE"
  | "KITCHEN"
  | "MONITOR"
  | "OTHER";

export type EndpointKindInfo = {
  value: EndpointKind;
  label: string;
  color: string; // HSL string; matches design tokens where possible
  icon: LucideIcon;
  group: "device" | "outlet" | "outdoor" | "system";
};

export const ENDPOINT_KINDS: EndpointKindInfo[] = [
  {
    value: "WORKSTATION",
    label: "Pracoviště / PC",
    color: "hsl(210 80% 50%)",
    icon: Monitor,
    group: "device",
  },
  { value: "MONITOR", label: "Monitor", color: "hsl(200 70% 55%)", icon: Monitor, group: "device" },
  { value: "AP", label: "Wi-Fi AP", color: "hsl(160 60% 45%)", icon: Wifi, group: "device" },
  { value: "CAMERA", label: "Kamera", color: "hsl(15 80% 55%)", icon: Cctv, group: "device" },
  {
    value: "SOCKET",
    label: "Datová zásuvka",
    color: "hsl(260 55% 55%)",
    icon: Plug,
    group: "outlet",
  },
  {
    value: "TRUNK_STRIP",
    label: "Lišta",
    color: "hsl(280 50% 55%)",
    icon: PanelTop,
    group: "outlet",
  },
  { value: "CEILING", label: "Strop", color: "hsl(220 30% 55%)", icon: PanelTop, group: "outlet" },
  { value: "KITCHEN", label: "Kuchyně", color: "hsl(35 80% 55%)", icon: Utensils, group: "outlet" },
  { value: "KIOSK", label: "Kiosek", color: "hsl(300 45% 55%)", icon: Container, group: "outlet" },
  {
    value: "OUTDOOR_KIOSK",
    label: "Venkovní kiosek",
    color: "hsl(90 45% 45%)",
    icon: Warehouse,
    group: "outdoor",
  },
  {
    value: "OUTDOOR_CABLE",
    label: "Venkovní kabel",
    color: "hsl(120 40% 45%)",
    icon: Waves,
    group: "outdoor",
  },
  { value: "PATCH", label: "Patch", color: "hsl(0 0% 20%)", icon: Server, group: "system" },
  { value: "OTHER", label: "Jiné", color: "hsl(0 0% 40%)", icon: HelpCircle, group: "system" },
];

const KIND_MAP: Record<string, EndpointKindInfo> = Object.fromEntries(
  ENDPOINT_KINDS.map((k) => [k.value, k]),
);

export function endpointKindInfo(kind: string | null | undefined): EndpointKindInfo {
  if (!kind) return KIND_MAP.OTHER;
  return KIND_MAP[kind] ?? KIND_MAP.OTHER;
}

export function endpointKindLabel(kind: string | null | undefined): string {
  return endpointKindInfo(kind).label;
}

export function endpointKindColor(kind: string | null | undefined): string {
  return endpointKindInfo(kind).color;
}

// Skupinové řazení pro UI select
export const ENDPOINT_KIND_GROUPS: Array<{ id: string; label: string; kinds: EndpointKindInfo[] }> =
  [
    { id: "device", label: "Zařízení", kinds: ENDPOINT_KINDS.filter((k) => k.group === "device") },
    {
      id: "outlet",
      label: "Zásuvky / místa",
      kinds: ENDPOINT_KINDS.filter((k) => k.group === "outlet"),
    },
    {
      id: "outdoor",
      label: "Venkovní",
      kinds: ENDPOINT_KINDS.filter((k) => k.group === "outdoor"),
    },
    { id: "system", label: "Systémové", kinds: ENDPOINT_KINDS.filter((k) => k.group === "system") },
  ];
