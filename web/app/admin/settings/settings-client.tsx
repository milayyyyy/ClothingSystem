"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldOff, KeyRound, Mail, Phone, QrCode } from "lucide-react";
import Image from "next/image";

type TotpFactor = { id: string; friendly_name?: string; factor_type: string; status: string };

// ---------------------------------------------------------------------------
// Small re-usable section wrapper
// ---------------------------------------------------------------------------
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inline status message
// ---------------------------------------------------------------------------
function Msg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const isErr = msg.toLowerCase().startsWith("error") || msg.toLowerCase().includes("failed") || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("wrong");
  return (
    <p className={`text-sm ${isErr ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>{msg}</p>
  );
}

// ---------------------------------------------------------------------------
// Main settings component
// ---------------------------------------------------------------------------
export function SettingsClient({ initialEmail, initialPhone }: { initialEmail: string; initialPhone: string }) {
  const supabase = createClient();

  // ── Account ──────────────────────────────────────────────────────────────
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [acMsg, setAcMsg] = useState<string | null>(null);
  const [acBusy, setAcBusy] = useState(false);

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setAcBusy(true);
    setAcMsg(null);
    try {
      const payload: Record<string, string> = {};
      if (email !== initialEmail) payload.email = email;
      if (phone !== initialPhone) payload.phone = phone;
      if (!Object.keys(payload).length) { setAcMsg("Nothing changed."); return; }
      const { error } = await supabase.auth.updateUser(payload);
      if (error) throw error;
      setAcMsg("Saved. " + (payload.email ? "Check your new email to confirm the change." : ""));
    } catch (err: unknown) {
      setAcMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAcBusy(false);
    }
  }

  // ── Password ──────────────────────────────────────────────────────────────
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setPwMsg("Error: Passwords do not match."); return; }
    if (pw.length < 8) { setPwMsg("Error: Password must be at least 8 characters."); return; }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPwMsg("Password updated successfully.");
      setPw(""); setPw2("");
    } catch (err: unknown) {
      setPwMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPwBusy(false);
    }
  }

  // ── 2FA / TOTP ─────────────────────────────────────────────────────────
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaMsg, setTwoFaMsg] = useState<string | null>(null);

  // Enroll flow
  const [enrollStep, setEnrollStep] = useState<"idle" | "qr" | "verify">("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [enrollFactorId, setEnrollFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");

  async function loadFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as TotpFactor[]);
  }

  useEffect(() => { void loadFactors(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFactor = factors.find((f) => f.status === "verified");
  const isEnrolled = !!activeFactor;

  async function startEnroll() {
    setTwoFaBusy(true);
    setTwoFaMsg(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Admin TOTP" });
      if (error) throw error;
      setQrUrl(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrollFactorId(data.id);
      // Create initial challenge for verification
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: data.id });
      if (ce) throw ce;
      setChallengeId(ch.id);
      setEnrollStep("qr");
    } catch (err: unknown) {
      setTwoFaMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function verifyEnroll(e: React.FormEvent) {
    e.preventDefault();
    setTwoFaBusy(true);
    setTwoFaMsg(null);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId: enrollFactorId, challengeId, code: otp.replace(/\s/g, "") });
      if (error) throw error;
      setEnrollStep("idle");
      setOtp("");
      setTwoFaMsg("2FA enabled successfully!");
      await loadFactors();
    } catch (err: unknown) {
      setTwoFaMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function cancelEnroll() {
    if (enrollFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrollFactorId }).catch(() => null);
    }
    setEnrollStep("idle");
    setOtp("");
    setTwoFaMsg(null);
  }

  async function disableTwoFa() {
    if (!activeFactor) return;
    if (!confirm("Disable 2-factor authentication? Your account will be less secure.")) return;
    setTwoFaBusy(true);
    setTwoFaMsg(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactor.id });
      if (error) throw error;
      setTwoFaMsg("2FA has been disabled.");
      await loadFactors();
    } catch (err: unknown) {
      setTwoFaMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTwoFaBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl space-y-6">

      {/* Account info */}
      <Section title="Account" description="Update your email address and phone number.">
        <form onSubmit={saveAccount} className="space-y-3">
          <div>
            <Label htmlFor="s-email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </Label>
            <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" required />
          </div>
          <div>
            <Label htmlFor="s-phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Phone
            </Label>
            <Input id="s-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="+63 912 345 6789" />
            <p className="mt-1 text-xs text-muted-foreground">E.164 format required (e.g. +639123456789). May require SMS verification.</p>
          </div>
          <Msg msg={acMsg} />
          <Button type="submit" disabled={acBusy}>{acBusy ? "Saving…" : "Save account info"}</Button>
        </form>
      </Section>

      {/* Password */}
      <Section title="Change Password" description="Set a new password for your administrator account.">
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <Label htmlFor="s-pw" className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> New password
            </Label>
            <Input id="s-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1" autoComplete="new-password" minLength={8} required />
          </div>
          <div>
            <Label htmlFor="s-pw2">Confirm new password</Label>
            <Input id="s-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="mt-1" autoComplete="new-password" minLength={8} required />
          </div>
          <Msg msg={pwMsg} />
          <Button type="submit" disabled={pwBusy}>{pwBusy ? "Updating…" : "Update password"}</Button>
        </form>
      </Section>

      {/* 2FA */}
      <Section
        title="Two-Factor Authentication (2FA)"
        description="Protect your admin account with a time-based one-time password (TOTP) via an authenticator app like Google Authenticator or Authy."
      >
        <div className="flex items-center gap-3">
          {isEnrolled ? (
            <Badge variant="green" className="flex items-center gap-1.5 px-3 py-1 text-sm">
              <ShieldCheck className="h-4 w-4" /> 2FA Enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 text-sm text-muted-foreground">
              <ShieldOff className="h-4 w-4" /> 2FA Disabled
            </Badge>
          )}
        </div>

        {/* Not enrolled — show setup flow */}
        {!isEnrolled && enrollStep === "idle" && (
          <Button type="button" onClick={startEnroll} disabled={twoFaBusy}>
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            {twoFaBusy ? "Setting up…" : "Enable 2FA"}
          </Button>
        )}

        {/* QR step */}
        {enrollStep === "qr" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Step 1 — Scan this QR code with your authenticator app</p>
            {qrUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="2FA QR code" className="h-44 w-44 rounded-md border bg-white p-1" />
              </div>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Can&apos;t scan? Enter the secret key manually</summary>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{secret}</code>
            </details>
            <p className="text-sm font-medium">Step 2 — Enter the 6-digit code from your app</p>
            <form onSubmit={verifyEnroll} className="flex gap-2">
              <Input
                className="w-40 text-center font-mono text-lg tracking-widest"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <Button type="submit" disabled={twoFaBusy || otp.length < 6}>
                {twoFaBusy ? "Verifying…" : "Verify & enable"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEnroll}>Cancel</Button>
            </form>
          </div>
        )}

        {/* Enrolled — disable option */}
        {isEnrolled && (
          <Button type="button" variant="destructive" onClick={disableTwoFa} disabled={twoFaBusy}>
            <ShieldOff className="mr-1.5 h-4 w-4" />
            {twoFaBusy ? "Disabling…" : "Disable 2FA"}
          </Button>
        )}

        <Msg msg={twoFaMsg} />

        <p className="text-xs text-muted-foreground">
          When 2FA is enabled, sensitive actions (like bulk deleting activity logs) will require your authenticator code.
        </p>
      </Section>
    </div>
  );
}
