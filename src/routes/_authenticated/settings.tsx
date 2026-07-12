import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, BellOff, LogOut, Loader2, Send, Star, StarOff, UserMinus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageToggle } from "@/components/language-toggle";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, listMyOrganizations } from "@/lib/orgs.functions";
import {
  getMyNotificationPrefs,
  leaveOrganization,
  setMyNotificationPrefs,
  updateMyProfile,
  type NotificationPrefs,
} from "@/lib/settings.functions";
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getExistingPushSubscription,
  isPushSupported,
} from "@/lib/pushClient";
import { sendTestPush } from "@/lib/push.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [{ title: "Nastavení · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nastavení</h1>
        <p className="text-sm text-muted-foreground">
          Spravuj svůj profil, firmy, bezpečnost a notifikace.
        </p>
      </header>

      <Tabs defaultValue="profile" className="max-w-3xl">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="orgs">Moje firmy</TabsTrigger>
          <TabsTrigger value="security">Bezpečnost</TabsTrigger>
          <TabsTrigger value="notifications">Notifikace</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="orgs">
          <OrgsSection />
        </TabsContent>
        <TabsContent value="security">
          <SecuritySection />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsSection />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Card({ children, title, desc }: { children: React.ReactNode; title: string; desc?: string }) {
  return (
    <section className="rounded-sm border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {desc && <p className="mb-3 text-xs text-muted-foreground">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/* ---------------- Profil ---------------- */

function ProfileSection() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const profile = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setFullName(profile.data.full_name ?? "");
      setPhone((profile.data as { phone?: string | null }).phone ?? "");
    }
  }, [profile.data]);

  async function save() {
    setSubmitting(true);
    try {
      await updateFn({ data: { full_name: fullName.trim() || null, phone: phone.trim() || null } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Uloženo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Základní údaje" desc="Jméno a kontakt, které vidí ostatní členové firmy.">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={profile.data?.email ?? ""} disabled />
          <p className="text-xs text-muted-foreground">
            Email lze změnit v sekci Bezpečnost.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Celé jméno</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+420 …" />
        </div>
        <div className="flex items-center justify-between rounded-sm border border-border p-3">
          <div>
            <div className="text-sm font-medium">Jazyk aplikace</div>
            <div className="text-xs text-muted-foreground">Nastaví jazyk rozhraní pro toto zařízení.</div>
          </div>
          <LanguageToggle />
        </div>
        <div>
          <Button onClick={save} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Uložit
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Firmy ---------------- */

function OrgsSection() {
  const qc = useQueryClient();
  const listOrgs = useServerFn(listMyOrganizations);
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const leaveFn = useServerFn(leaveOrganization);

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const profile = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const defaultOrgId = profile.data?.default_organization_id ?? null;

  async function setDefault(orgId: string | null) {
    try {
      await updateFn({ data: { default_organization_id: orgId } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(orgId ? "Výchozí firma nastavena" : "Výchozí firma zrušena");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function leave(orgId: string, name: string) {
    if (!confirm(`Opravdu odejít z firmy „${name}"? Ztratíš přístup ke všem jejím projektům.`)) return;
    try {
      const res = await leaveFn({ data: { organizationId: orgId } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["orgs"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Odešel(a) jsi z firmy");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Card
      title="Firmy, ve kterých pracuješ"
      desc="Vyber výchozí firmu, případně sám odejdi. Podrobnou správu členů provede admin firmy v jejím nastavení."
    >
      {orgs.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (orgs.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nejsi členem žádné firmy.</p>
      ) : (
        <ul className="divide-y divide-border">
          {(orgs.data ?? []).map((o) => {
            const isDefault = o.id === defaultOrgId;
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{o.name}</span>
                    {isDefault && (
                      <Badge variant="default" className="font-mono text-[10px]">
                        výchozí
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefault(isDefault ? null : o.id)}
                    title={isDefault ? "Zrušit výchozí" : "Nastavit jako výchozí"}
                  >
                    {isDefault ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => leave(o.id, o.name)}
                    title="Odejít z firmy"
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Bezpečnost ---------------- */

function SecuritySection() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function changeEmail() {
    if (!email.trim()) return;
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw error;
      toast.success("Odeslán potvrzovací email na novou adresu");
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSavingEmail(false);
    }
  }

  async function changePassword() {
    if (pw.length < 8) {
      toast.error("Heslo musí mít alespoň 8 znaků");
      return;
    }
    if (pw !== pw2) {
      toast.error("Hesla se neshodují");
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Heslo bylo změněno");
      setPw("");
      setPw2("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSavingPw(false);
    }
  }

  async function signOutEverywhere() {
    if (!confirm("Odhlásit se ze všech zařízení?")) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      window.location.href = "/auth";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Změna emailu" desc="Na novou adresu ti přijde potvrzovací odkaz.">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="newEmail">Nový email</Label>
            <Input
              id="newEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button onClick={changeEmail} disabled={savingEmail || !email}>
            Odeslat
          </Button>
        </div>
      </Card>

      <Card title="Změna hesla" desc="Minimálně 8 znaků.">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pw">Nové heslo</Label>
            <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw2">Potvrzení hesla</Label>
            <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <Button onClick={changePassword} disabled={savingPw || !pw || !pw2}>
            {savingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Změnit heslo
          </Button>
        </div>
      </Card>

      <Card title="Aktivní přihlášení" desc="Odhlásí tě ze všech prohlížečů a zařízení.">
        <Button variant="destructive" onClick={signOutEverywhere} disabled={signingOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Odhlásit ze všech zařízení
        </Button>
      </Card>
    </div>
  );
}

/* ---------------- Notifikace ---------------- */

const PREF_META: Array<{ key: keyof NotificationPrefs; label: string; group: "inapp" | "email" }> = [
  { key: "inapp_task_assigned", label: "Nový přiřazený úkol", group: "inapp" },
  { key: "inapp_defect_assigned", label: "Přiřazená závada", group: "inapp" },
  { key: "inapp_defect_status", label: "Změna stavu závady", group: "inapp" },
  { key: "inapp_chat_mention", label: "Zmínka v chatu", group: "inapp" },
  { key: "inapp_project_member", label: "Přidání do projektu", group: "inapp" },
  { key: "email_task_assigned", label: "Nový přiřazený úkol", group: "email" },
  { key: "email_defect_assigned", label: "Přiřazená závada", group: "email" },
  { key: "email_defect_status", label: "Změna stavu závady", group: "email" },
  { key: "email_chat_mention", label: "Zmínka v chatu", group: "email" },
  { key: "email_project_member", label: "Přidání do projektu", group: "email" },
];

function NotificationsSection() {
  const qc = useQueryClient();
  const getPrefs = useServerFn(getMyNotificationPrefs);
  const setPrefs = useServerFn(setMyNotificationPrefs);
  const prefs = useQuery({ queryKey: ["notif-prefs"], queryFn: () => getPrefs() });

  const [local, setLocal] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefs.data && !local) setLocal(prefs.data);
  }, [prefs.data, local]);

  if (!local) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  async function save() {
    if (!local) return;
    setSaving(true);
    try {
      await setPrefs({ data: local });
      await qc.invalidateQueries({ queryKey: ["notif-prefs"] });
      toast.success("Uloženo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSaving(false);
    }
  }

  const inapp = PREF_META.filter((p) => p.group === "inapp");
  const email = PREF_META.filter((p) => p.group === "email");

  return (
    <div className="space-y-4">
      <PushDeviceCard />

      <Card title="V aplikaci" desc="Notifikace zobrazované v aplikaci a v zvonečku.">
        <ul className="divide-y divide-border">
          {inapp.map((p) => (
            <li key={p.key} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{p.label}</span>
              <Switch
                checked={local[p.key]}
                onCheckedChange={(v) => setLocal({ ...local, [p.key]: v })}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Emailem" desc="Doručování emailů se aktivuje po nasazení emailové brány.">
        <ul className="divide-y divide-border">
          {email.map((p) => (
            <li key={p.key} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{p.label}</span>
              <Switch
                checked={local[p.key]}
                onCheckedChange={(v) => setLocal({ ...local, [p.key]: v })}
              />
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Uložit
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Push zařízení ---------------- */

function PushDeviceCard() {
  const testFn = useServerFn(sendTestPush);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const supported = typeof window !== "undefined" && isPushSupported();
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIOS =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  useEffect(() => {
    if (!supported) {
      setEnabled(false);
      return;
    }
    getExistingPushSubscription().then((s) => setEnabled(!!s));
  }, [supported]);

  async function toggle(v: boolean) {
    setBusy(true);
    try {
      if (v) {
        const res = await enablePushOnThisDevice();
        if (!res.ok) {
          toast.error(res.reason ?? "Nepodařilo se povolit");
          setEnabled(false);
          return;
        }
        setEnabled(true);
        toast.success("Push notifikace jsou aktivní na tomto zařízení");
      } else {
        await disablePushOnThisDevice();
        setEnabled(false);
        toast.success("Push vypnut na tomto zařízení");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      await testFn();
      toast.success("Odesláno – notifikace by měla dorazit během pár vteřin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      title="Push do telefonu / prohlížeče"
      desc={`Zapni push na každém zařízení zvlášť. Na iPhonu je potřeba nejdřív aplikaci "Přidat na plochu" v Safari a spustit ji z ikony.`}
    >
      {isIOS && !isStandalone && (
        <div className="mb-3 rounded-sm border border-accent/40 bg-accent/5 p-3 text-xs text-accent-foreground">
          <strong className="font-semibold">iPhone:</strong> Nahoře v Safari klepni na
          Sdílet <span className="font-mono">⎋</span> → &bdquo;Přidat na plochu&ldquo;. Push notifikace fungují
          na iOS jen v aplikaci spuštěné z plochy.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {enabled ? (
            <Bell className="h-4 w-4 text-accent" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm">
            {!supported
              ? "Toto zařízení / prohlížeč push nepodporuje"
              : enabled === null
                ? "Zjišťuji stav…"
                : enabled
                  ? "Push aktivní na tomto zařízení"
                  : "Push vypnut na tomto zařízení"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {enabled && (
            <Button variant="outline" size="sm" onClick={test} disabled={testing}>
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Test
            </Button>
          )}
          <Switch
            checked={!!enabled}
            onCheckedChange={toggle}
            disabled={!supported || busy || enabled === null}
          />
        </div>
      </div>
    </Card>
  );
}
