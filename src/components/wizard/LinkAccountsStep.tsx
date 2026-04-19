import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import {
  createKnotTransactionLinkSession,
  getKnotBackendStatus,
  listKnotTransactionLinkMerchants,
} from "@/lib/api";
import { mockTransactions, type Transaction } from "@/data/mock-transactions";
import {
  ShoppingBag,
  Store,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Truck,
  Package2,
} from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

/** Instant demo sync user (does not need to match session userId; server falls back to demo catalog when Knot is empty). */
const DEMO_HACKATHON_SYNC_USER = "demo-user-123";

interface DisplayMerchant {
  id: number;
  /** Knot TransactionLink merchant id (DoorDash is 19). */
  knotMerchantId: number;
  name: string;
  subtitle: string;
  mode: "real" | "demo";
}

interface DemoConnectedAccount {
  merchantId: number;
  merchantName: string;
  connectedAt: string;
  source: "demo";
}

interface RealConnectedAccount {
  merchantId: number;
  merchantName: string;
  connectedAt: string;
  source: "real";
}

type MerchantConnectionState = "real_connected" | "demo_connected" | "pending";

const DISPLAY_MERCHANTS: DisplayMerchant[] = [
  { id: 19, knotMerchantId: 19, name: "DoorDash", subtitle: "Live TransactionLink path", mode: "real" },
  { id: 4, knotMerchantId: 4, name: "Amazon", subtitle: "Demo connection", mode: "demo" },
  { id: 77, knotMerchantId: 77, name: "Uber Eats", subtitle: "Demo connection", mode: "demo" },
  { id: 88, knotMerchantId: 88, name: "Shop Pay", subtitle: "Demo connection", mode: "demo" },
];

const ICON_MAP: Record<string, typeof ShoppingBag> = {
  DoorDash: Store,
  Amazon: ShoppingBag,
  "Uber Eats": Truck,
  "Shop Pay": Package2,
};

/** Load Knot Web SDK via script tag (browser cannot resolve bare knotapi-js dynamic import). */
async function loadKnotSDK(): Promise<new () => { open: (opts: Record<string, unknown>) => void }> {
  type KnotCtor = new () => { open: (opts: Record<string, unknown>) => void };
  type KnotNamespace = { default?: unknown } & Record<string, unknown>;

  const ns =
    (window as unknown as { KnotapiJS?: KnotNamespace }).KnotapiJS ??
    (self as unknown as { KnotapiJS?: KnotNamespace }).KnotapiJS;
  if (ns) {
    const SDK = ns.default ?? ns;
    if (typeof SDK === "function") {
      return SDK as KnotCtor;
    }
  }

  return new Promise<KnotCtor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/knotapi.js";
    script.async = true;
    script.onload = () => {
      const loadedNs =
        (window as unknown as { KnotapiJS?: KnotNamespace }).KnotapiJS ??
        (self as unknown as { KnotapiJS?: KnotNamespace }).KnotapiJS;
      if (!loadedNs) {
        reject(new Error("KnotapiJS not found on window after script load"));
        return;
      }
      const SDK = loadedNs.default ?? loadedNs;
      if (typeof SDK !== "function") {
        reject(new Error("KnotapiJS is not a constructor"));
        return;
      }
      resolve(SDK as KnotCtor);
    };
    script.onerror = () => reject(new Error("Failed to load Knot SDK script"));
    document.head.appendChild(script);
  });
}

function readDemoConnectedAccounts(): DemoConnectedAccount[] {
  try {
    const raw = localStorage.getItem("demo-connected-accounts");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDemoConnectedAccounts(accounts: DemoConnectedAccount[]) {
  localStorage.setItem("demo-connected-accounts", JSON.stringify(accounts));
}

function readRealConnectedAccounts(): RealConnectedAccount[] {
  try {
    const raw = localStorage.getItem("knot-real-connected-accounts");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRealConnectedAccounts(accounts: RealConnectedAccount[]) {
  localStorage.setItem("knot-real-connected-accounts", JSON.stringify(accounts));
}

function getOrCreateKnotUserId() {
  const existing = localStorage.getItem("knot-demo-user-id");
  if (existing) return existing;

  const next = `vigilant-${Date.now()}`;
  localStorage.setItem("knot-demo-user-id", next);
  return next;
}

const KNOT_WIZARD_TRANSACTIONS_KEY = "knot-wizard-transactions";

function mapKnotSyncToWizardTransactions(
  knotTxs: unknown[],
  merchantDisplayName: string
): Transaction[] {
  if (!Array.isArray(knotTxs)) return [];
  return knotTxs.map((raw, idx) => {
    const t = raw as Record<string, unknown>;
    const price = (t.price as Record<string, unknown>) || {};
    const productsRaw = Array.isArray(t.products) ? t.products : [];
    const products = productsRaw.map((item: unknown, pIdx: number) => {
      const p = item as Record<string, unknown>;
      const pp = (p.price as Record<string, unknown>) || {};
      return {
        external_id: String(p.external_id ?? `knot-sku-${idx}-${pIdx}`),
        name: String(p.name ?? "Item"),
        description: String(p.description ?? ""),
        image_url: String(p.image_url ?? ""),
        quantity: Number(p.quantity ?? 1) || 1,
        price: {
          total: String(pp.total ?? "0"),
          unit_price: String(pp.unit_price ?? pp.total ?? "0"),
        },
      };
    });
    return {
      id: String(t.id ?? `knot-txn-${idx}`),
      datetime: String(t.datetime ?? new Date().toISOString()),
      merchant: merchantDisplayName,
      order_status: String(t.order_status ?? "COMPLETED"),
      products,
      total: String(price.total ?? "0"),
    };
  });
}

interface LinkAccountsStepProps {
  onNext: (transactions: Transaction[]) => void;
  onBack: () => void;
}

export function LinkAccountsStep({ onNext, onBack }: LinkAccountsStepProps) {
  const { isMock } = useMockToggle();
  const [connectionStates, setConnectionStates] = useState<Record<number, MerchantConnectionState>>({});
  const [status, setStatus] = useState<string>("");
  const [loadingMerchantId, setLoadingMerchantId] = useState<number | null>(null);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [realMerchantAvailable, setRealMerchantAvailable] = useState(false);
  const [demoFallbackMerchant, setDemoFallbackMerchant] = useState<DisplayMerchant | null>(null);

  const knotEnabled = import.meta.env.VITE_KNOT_ENABLED === "true";
  const knotClientId = import.meta.env.VITE_KNOT_CLIENT_ID;
  const knotEnvironment = import.meta.env.VITE_KNOT_ENVIRONMENT || "development";
  const realModeEligible = !isMock && knotEnabled && Boolean(knotClientId) && backendReady && realMerchantAvailable;

  useEffect(() => {
    const demoAccounts = readDemoConnectedAccounts();
    const realAccounts = readRealConnectedAccounts();

    const next: Record<number, MerchantConnectionState> = {};
    for (const account of demoAccounts) {
      next[account.merchantId] = "demo_connected";
    }
    for (const account of realAccounts) {
      next[account.merchantId] = "real_connected";
    }

    setConnectionStates(next);
  }, []);

  useEffect(() => {
    if (isMock || !knotEnabled || !knotClientId) {
      setBackendReady(false);
      setRealMerchantAvailable(false);
      console.log("[knot-connect] real_mode_eligibility", {
        isMock,
        knotEnabled,
        hasClientId: Boolean(knotClientId),
        backendReady: false,
        realMerchantAvailable: false,
        eligible: false,
      });
      return;
    }

    setLoadingMerchants(true);
    Promise.all([getKnotBackendStatus(), listKnotTransactionLinkMerchants()])
      .then(([backendStatus, merchantResponse]) => {
        const nextBackendReady = Boolean(backendStatus?.ok);
        setBackendReady(nextBackendReady);

        const merchants = Array.isArray(merchantResponse?.merchants)
          ? merchantResponse.merchants
          : Array.isArray(merchantResponse)
            ? merchantResponse
            : [];

        const doorDashSupported = merchants.some((merchant: { id?: number; name?: string }) => {
          const name = (merchant.name || "").toLowerCase();
          return merchant.id === 19 || name.includes("doordash");
        });

        setRealMerchantAvailable(doorDashSupported);
        console.log("[knot-connect] real_mode_eligibility", {
          isMock,
          knotEnabled,
          hasClientId: Boolean(knotClientId),
          backendReady: nextBackendReady,
          realMerchantAvailable: doorDashSupported,
          eligible: !isMock && knotEnabled && Boolean(knotClientId) && nextBackendReady && doorDashSupported,
        });
      })
      .catch(() => {
        setBackendReady(false);
        setRealMerchantAvailable(false);
        console.log("[knot-connect] real_mode_eligibility", {
          isMock,
          knotEnabled,
          hasClientId: Boolean(knotClientId),
          backendReady: false,
          realMerchantAvailable: false,
          eligible: false,
        });
      })
      .finally(() => setLoadingMerchants(false));
  }, [isMock, knotClientId, knotEnabled]);

  const setMerchantConnectionState = (merchantId: number, state: MerchantConnectionState) => {
    setConnectionStates((prev) => ({ ...prev, [merchantId]: state }));
  };

  const markMerchantConnected = (m: DisplayMerchant) => {
    const existingReal = readRealConnectedAccounts();
    writeRealConnectedAccounts([
      {
        merchantId: m.id,
        merchantName: m.name,
        connectedAt: new Date().toISOString(),
        source: "real",
      },
      ...existingReal.filter((account) => account.merchantId !== m.id),
    ]);
    setMerchantConnectionState(m.id, "real_connected");
    setLoadingMerchantId(null);
    setStatus(
      `${m.name} connected via Knot TransactionLink. Continue to analyze with demo purchase data.`
    );
  };

  const openDemoFallback = (merchant: DisplayMerchant, reason?: string) => {
    if (reason) setStatus(reason);
    setDemoFallbackMerchant(merchant);
  };

  const clearMerchantConnectionState = (merchantId: number) => {
    setConnectionStates((prev) => {
      const next = { ...prev };
      delete next[merchantId];
      return next;
    });
  };

  const showRealModeUnavailable = (merchant: DisplayMerchant, reason: string) => {
    clearMerchantConnectionState(merchant.id);
    setLoadingMerchantId(null);
    setStatus(`Knot unavailable for ${merchant.name}: ${reason}`);
  };

  const handleConfirmDemoFallback = () => {
    if (!demoFallbackMerchant) return;

    const existing = readDemoConnectedAccounts();
    const next = [
      {
        merchantId: demoFallbackMerchant.id,
        merchantName: demoFallbackMerchant.name,
        connectedAt: new Date().toISOString(),
        source: "demo" as const,
      },
      ...existing.filter((account) => account.merchantId !== demoFallbackMerchant.id),
    ];

    writeDemoConnectedAccounts(next);
    setMerchantConnectionState(demoFallbackMerchant.id, "demo_connected");
    setStatus(`${demoFallbackMerchant.name} connected in demo mode.`);
    setDemoFallbackMerchant(null);
  };

  const handleLinkMerchant = async (merchant: DisplayMerchant) => {
    console.log("[knot-connect] button_click", {
      merchantId: merchant.id,
      merchantName: merchant.name,
      mode: merchant.mode,
    });

    console.log("[knot-connect] real_mode_eligibility_result", {
      merchantId: merchant.id,
      merchantName: merchant.name,
      isMock,
      knotEnabled,
      hasClientId: Boolean(knotClientId),
      backendReady,
      realMerchantAvailable,
      realModeEligible,
    });

    if (merchant.mode === "demo") {
      openDemoFallback(
        merchant,
        `${merchant.name} is demo-only in this build.`
      );
      return;
    }

    if (!realModeEligible) {
      const reason = isMock
        ? "mock mode is enabled"
        : !knotEnabled
          ? "VITE_KNOT_ENABLED is not set to true"
          : !knotClientId
            ? "VITE_KNOT_CLIENT_ID is missing"
            : !backendReady
              ? "backend session route is unavailable"
              : !realMerchantAvailable
                ? "DoorDash is not available from the Knot merchant list"
                : "real mode is not eligible";
      showRealModeUnavailable(merchant, reason);
      return;
    }

    try {
      setMerchantConnectionState(merchant.id, "pending");
      setLoadingMerchantId(merchant.id);
      setStatus(`Creating Knot session for ${merchant.name}...`);
      const userId = getOrCreateKnotUserId();

      console.log("[knot-connect] backend_session_request_start", {
        merchantId: merchant.id,
        merchantName: merchant.name,
        userId,
      });
      const sessionResponse = await createKnotTransactionLinkSession(userId);
      console.log("[knot-connect] backend_session_request_success", {
        merchantId: merchant.id,
        merchantName: merchant.name,
        userId,
        sessionId: sessionResponse.sessionId,
      });

      let linkSucceeded = false;

      try {
        const txRes = await fetch(`${import.meta.env.VITE_API_URL}/api/knot/transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId: merchant.id,
            externalUserId: DEMO_HACKATHON_SYNC_USER,
          }),
        });
        const txData = await txRes.json();
        console.log("[knot-connect] transactions synced", txData);
        if (txRes.ok && Array.isArray(txData.transactions) && txData.transactions.length > 0) {
          const raw = txData.transactions as unknown[];
          const first = raw[0] as Record<string, unknown> | undefined;
          const txs =
            first && Array.isArray(first.products)
              ? (raw as Transaction[])
              : mapKnotSyncToWizardTransactions(raw, merchant.name);
          localStorage.setItem(KNOT_WIZARD_TRANSACTIONS_KEY, JSON.stringify(txs));
          markMerchantConnected(merchant);
          linkSucceeded = true;
        }
      } catch (e) {
        console.log("[knot-connect] sync failed, continuing anyway", e);
      }

      console.log("[knot-connect] sdk_script_load_start", {
        merchantId: merchant.id,
        merchantName: merchant.name,
      });
      let knot;
      try {
        const KnotapiJS = await loadKnotSDK();
        console.log("[knot-connect] sdk_script_load_success", {
          merchantId: merchant.id,
          merchantName: merchant.name,
        });
        knot = new KnotapiJS();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load knotapi-js";
        console.log("[knot-connect] sdk_script_load_failure", {
          merchantId: merchant.id,
          merchantName: merchant.name,
          message,
        });
        throw new Error(message);
      }

      console.log("[knot-connect] sdk_open_start", {
        merchantId: merchant.id,
        merchantName: merchant.name,
        knotMerchantId: merchant.knotMerchantId,
      });

      knot.open({
        sessionId: sessionResponse.sessionId,
        clientId: sessionResponse.clientId || knotClientId,
        environment: sessionResponse.environment || knotEnvironment,
        // DoorDash knot merchant id is 19
        merchantIds: [merchant.knotMerchantId],
        entryPoint: "onboarding",
        useCategories: true,
        useSearch: true,
        onSuccess: (details: unknown) => {
          console.log("[knot-connect] onSuccess", details);
          linkSucceeded = true;
          markMerchantConnected(merchant);
        },
        onEvent: (event: string, merchantId: number) => {
          console.log("[knot-connect] onEvent", { event, merchantId });
          if (event === "LOGIN_STARTED") {
            setStatus(`Connecting ${merchant.name}...`);
          } else if (event === "AUTHENTICATED") {
            setStatus(`${merchant.name} authenticated. Finalizing connection...`);
          } else if (event === "OTP_REQUIRED" || event === "QUESTIONS_REQUIRED") {
            setStatus(`Additional verification required for ${merchant.name}.`);
          }
        },
        onExit: (merchantId: number, completed: boolean) => {
          console.log("[knot-connect] onExit", { merchantId, completed });
          setLoadingMerchantId(null);
          if (!completed && !linkSucceeded) {
            clearMerchantConnectionState(merchant.id);
            setStatus(`Knot flow closed for ${merchant.name}. Retry to continue with the real login flow.`);
          }
        },
        onError: (errorCode: string, message: string) => {
          console.log("[knot-connect] onError", { errorCode, message });
          clearMerchantConnectionState(merchant.id);
          setLoadingMerchantId(null);
          setStatus(`Knot unavailable for ${merchant.name}: ${message || errorCode || "Unable to initialize TransactionLink"}`);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Knot";
      console.log("[knot-connect] backend_session_request_failure", {
        merchantId: merchant.id,
        merchantName: merchant.name,
        message,
      });
      clearMerchantConnectionState(merchant.id);
      setLoadingMerchantId(null);
      setStatus(`Knot unavailable for ${merchant.name}: ${message}`);
    }
  };

  const handleProceed = () => {
    try {
      const raw = localStorage.getItem(KNOT_WIZARD_TRANSACTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          onNext(parsed as Transaction[]);
          return;
        }
      }
    } catch {
      // ignore invalid stored data
    }
    onNext(mockTransactions);
  };

  const getIcon = (merchant: DisplayMerchant) => ICON_MAP[merchant.name] || ShoppingBag;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.42, ease: EASE_EXPO }}
      className="flex flex-col justify-center min-h-[calc(100vh-8rem)] max-w-lg mx-auto px-2"
    >
      {/* Header */}
      <p className="text-eyebrow mb-6">Step 1</p>
      <h2
        className="font-display font-bold leading-[0.92] tracking-tight text-foreground mb-4"
        style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)" }}
      >
        Connect your
        <br />
        accounts.
      </h2>
      <p className="text-base text-muted-foreground mb-10" style={{ maxWidth: "46ch" }}>
        Link a retailer to scan your actual purchase history. Powered by KnotAPI TransactionLink — we read transaction data only.
      </p>

      <p className="text-xs text-muted-foreground mb-6">
        DoorDash uses the live Knot TransactionLink path when configured. Amazon, Uber Eats, and Shop Pay stay in
        demo mode for this build.
      </p>
      <p className="text-xs text-muted-foreground mb-6 border border-border/60 rounded-lg px-3 py-2.5 bg-muted/30">
        <span className="font-medium text-foreground">Knot sandbox:</span> when the login iframe opens, use the{" "}
        <strong>test merchant credentials</strong> from your Knot developer dashboard (not your personal DoorDash
        password). Watch the browser console for <code className="text-[11px]">[knot-connect] onSuccess</code> after a
        successful link.
      </p>

      {/* Merchant rows */}
      <div className="mb-8">
        {loadingMerchants ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading merchants...</span>
          </div>
        ) : (
          DISPLAY_MERCHANTS.map((merchant, i) => {
            const connectionState = connectionStates[merchant.id];
            const isConnected = connectionState === "real_connected" || connectionState === "demo_connected";
            const isLoadingThis = loadingMerchantId === merchant.id;
            const Icon = getIcon(merchant);

            return (
              <motion.div
                key={merchant.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.38, ease: EASE_EXPO }}
                className="flex items-center justify-between py-4 border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{merchant.name}</p>
                      <Badge variant={merchant.mode === "real" ? "default" : "secondary"}>
                        {merchant.mode === "real" ? "Real" : "Demo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{merchant.subtitle}</p>
                  </div>
                </div>

                {connectionState === "pending" ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </span>
                ) : isConnected ? (
                  <span
                    className={`flex items-center gap-1.5 text-xs font-semibold ${
                      connectionState === "real_connected" ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {connectionState === "real_connected" ? "Connected (real)" : "Connected (demo)"}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLinkMerchant(merchant)}
                    disabled={loadingMerchantId !== null}
                    className="text-xs h-8"
                  >
                    {isLoadingThis ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Connect"
                    )}
                  </Button>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Status message */}
      {status && (
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
          {loadingMerchantId !== null && <Loader2 className="w-3 h-3 animate-spin" />}
          {status}
        </p>
      )}

      {/* Demo shortcut */}
      <p className="text-sm text-muted-foreground mb-10">
        No account to link?{" "}
        <button
          onClick={() => onNext(mockTransactions)}
          className="text-primary font-medium underline underline-offset-2 hover:no-underline"
        >
          Use demo data
        </button>{" "}
        — 14 pre-loaded products with known hazardous chemicals.
      </p>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="gap-1.5 text-sm px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Button>
        {Object.values(connectionStates).some(
          (state) => state === "real_connected" || state === "demo_connected"
        ) && (
          <Button onClick={handleProceed} className="gap-2 font-semibold">
            Continue with{" "}
            {
              Object.values(connectionStates).filter(
                (state) => state === "real_connected" || state === "demo_connected"
              ).length
            }{" "}
            account
            {Object.values(connectionStates).filter(
              (state) => state === "real_connected" || state === "demo_connected"
            ).length > 1
              ? "s"
              : ""}
          </Button>
        )}
      </div>

      {demoFallbackMerchant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close demo fallback"
            onClick={() => setDemoFallbackMerchant(null)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-2xl p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Demo fallback</p>
              <h3 className="text-lg font-semibold text-foreground">{demoFallbackMerchant.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {demoFallbackMerchant.mode === "real"
                  ? "Live Knot setup is unavailable, so we can simulate a connected account for the demo."
                  : "This merchant is shown as a safe demo-only connection in the current build."}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
              We will save this connected state locally under <span className="text-foreground">demo-connected-accounts</span>{" "}
              and continue using the existing demo transaction dataset.
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDemoFallbackMerchant(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirmDemoFallback}>
                Connect in Demo Mode
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
