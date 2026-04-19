import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useMockToggle } from "@/hooks/useMockToggle";
import {
  createKnotTransactionLinkSession,
  getKnotAccounts,
  getKnotBackendStatus,
  getKnotTransactions,
  listKnotTransactionLinkMerchants,
  syncKnotTransactions,
  type KnotAccountRow,
  type KnotMerchant,
  type KnotTransactionRow,
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
  X,
} from "lucide-react";

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

interface DisplayMerchant {
  /** Knot TransactionLink merchant id. Stable across environments. */
  knotMerchantId: number;
  name: string;
  subtitle: string;
  available: boolean;
}

/**
 * pending  = SDK modal is open, user has NOT yet authenticated
 * syncing  = auth succeeded; knot-proxy sync + DB poll in flight
 * connected = at least one transaction row observed for this merchant
 */
type MerchantConnectionState = "connected" | "pending" | "syncing";

/**
 * Merchant IDs we surface in the UI for Knot TransactionLink on web. IDs come
 * from GET /merchant/list?type=transaction_link&platform=web and are stable
 * across development and production environments.
 */
const TARGET_MERCHANTS: Array<{ id: number; name: string; subtitle: string }> = [
  { id: 19, name: "DoorDash", subtitle: "Food delivery history" },
  { id: 44, name: "Amazon", subtitle: "Retail purchase history" },
  { id: 36, name: "Uber Eats", subtitle: "Food delivery history" },
  { id: 2125, name: "Shop Pay", subtitle: "Shopify purchase history" },
];

const ICON_MAP: Record<string, typeof ShoppingBag> = {
  DoorDash: Store,
  Amazon: ShoppingBag,
  "Uber Eats": Truck,
  "Shop Pay": Package2,
};

type KnotCtor = new () => {
  open: (opts: Record<string, unknown>) => void;
};

/** Load Knot Web SDK via script tag (browser cannot resolve bare knotapi-js dynamic import). */
async function loadKnotSDK(): Promise<KnotCtor> {
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

const KNOT_WIZARD_TRANSACTIONS_KEY = "knot-wizard-transactions";
const KNOT_USER_ID_KEY = "knot-external-user-id";

function getOrCreateKnotUserId() {
  const existing = localStorage.getItem(KNOT_USER_ID_KEY);
  if (existing) return existing;

  const next = `vigilant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(KNOT_USER_ID_KEY, next);
  return next;
}

/**
 * Normalize a DB-backed Knot transaction row into the Transaction shape the
 * wizard downstream expects. The `raw` column preserves the original Knot
 * payload in case we later need fields we aren't surfacing here.
 */
function rowToWizardTransaction(row: KnotTransactionRow): Transaction {
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const productsRaw = Array.isArray(row.products)
    ? (row.products as Array<Record<string, unknown>>)
    : Array.isArray(raw.products)
      ? (raw.products as Array<Record<string, unknown>>)
      : [];
  const products = productsRaw.map((p, pIdx) => {
    const price = (p.price as Record<string, unknown>) || {};
    return {
      external_id: String(p.external_id ?? `${row.id}-sku-${pIdx}`),
      name: String(p.name ?? "Item"),
      description: String(p.description ?? ""),
      image_url: String(p.image_url ?? ""),
      quantity: Number(p.quantity ?? 1) || 1,
      price: {
        total: String(price.total ?? "0"),
        unit_price: String(price.unit_price ?? price.total ?? "0"),
      },
    };
  });
  return {
    id: row.id,
    datetime: row.datetime,
    merchant: row.merchant_name ?? "Unknown",
    order_status: row.order_status,
    products,
    total: row.price_total,
  };
}

interface LinkAccountsStepProps {
  onNext: (transactions: Transaction[]) => void;
  onBack: () => void;
}

export function LinkAccountsStep({ onNext, onBack }: LinkAccountsStepProps) {
  const { isMock } = useMockToggle();
  const [connectionStates, setConnectionStates] = useState<Record<number, MerchantConnectionState>>({});
  const [txnCountByMerchant, setTxnCountByMerchant] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<string>("");
  const [loadingMerchantId, setLoadingMerchantId] = useState<number | null>(null);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [serverClientId, setServerClientId] = useState<string | null>(null);
  const [serverEnvironment, setServerEnvironment] = useState<string>("development");
  const [availableMerchants, setAvailableMerchants] = useState<KnotMerchant[]>([]);

  // Ref-held so poll loops see the latest user id without re-subscribing.
  const userIdRef = useRef<string>("");
  const activePollsRef = useRef<Map<number, boolean>>(new Map());

  const envClientId = import.meta.env.VITE_KNOT_CLIENT_ID as string | undefined;
  const envEnvironment = (import.meta.env.VITE_KNOT_ENVIRONMENT as string | undefined) || "development";

  const clientId = serverClientId || envClientId || "";
  const environment = serverEnvironment || envEnvironment;

  const realModeEligible = !isMock && backendReady && Boolean(clientId);

  const displayMerchants: DisplayMerchant[] = useMemo(() => {
    const byId = new Map<number, KnotMerchant>();
    for (const m of availableMerchants) {
      if (typeof m.id === "number") byId.set(m.id, m);
    }
    return TARGET_MERCHANTS.map((t) => {
      const live = byId.get(t.id);
      return {
        knotMerchantId: t.id,
        name: live?.name ? String(live.name) : t.name,
        subtitle: t.subtitle,
        // In demo/mock mode, every merchant is "available" so the Connect flow
        // runs against mockTransactions. In real mode it's only available when
        // the Knot merchant-list endpoint confirmed it.
        available: isMock ? true : Boolean(live),
      };
    });
  }, [availableMerchants, isMock]);

  // In demo mode, precompute which mock transactions belong to which merchant
  // so we can report a realistic per-merchant txn count on "Connect".
  const mockTxnsByMerchant = useMemo(() => {
    const byName = new Map<string, Transaction[]>();
    for (const t of mockTransactions) {
      const key = (t.merchant ?? "").toLowerCase();
      const arr = byName.get(key) ?? [];
      arr.push(t);
      byName.set(key, arr);
    }
    const byMerchantId = new Map<number, Transaction[]>();
    for (const target of TARGET_MERCHANTS) {
      const txns = byName.get(target.name.toLowerCase()) ?? [];
      byMerchantId.set(target.id, txns);
    }
    return byMerchantId;
  }, []);

  /**
   * Refresh localStorage's wizard payload from the DB. Source of truth is the
   * Knot webhook-populated table; localStorage is only a handoff to the next
   * wizard step.
   */
  const persistWizardPayloadFromDb = useCallback(async (userId: string) => {
    try {
      const resp = await getKnotTransactions(userId, undefined, 1000);
      const rows = resp?.transactions ?? [];
      const mapped = rows.map(rowToWizardTransaction);
      localStorage.setItem(KNOT_WIZARD_TRANSACTIONS_KEY, JSON.stringify(mapped));
      return mapped.length;
    } catch (err) {
      console.warn("[knot-connect] persistWizardPayloadFromDb failed", err);
      return 0;
    }
  }, []);

  /**
   * On mount: figure out who we are to Knot, then ask the DB which merchants
   * are already connected and how many transactions each has.
   */
  useEffect(() => {
    if (isMock) {
      setBackendReady(false);
      setAvailableMerchants([]);
      return;
    }

    const userId = getOrCreateKnotUserId();
    userIdRef.current = userId;

    setLoadingMerchants(true);
    Promise.all([
      getKnotBackendStatus(),
      listKnotTransactionLinkMerchants("web"),
      getKnotAccounts(userId).catch((err) => {
        console.warn("[knot-connect] get-accounts failed on mount", err);
        return { accounts: [] as KnotAccountRow[] };
      }),
    ])
      .then(([statusResp, merchantsResp, accountsResp]) => {
        const nextReady = Boolean(statusResp?.ok);
        setBackendReady(nextReady);
        if (statusResp?.clientId) setServerClientId(statusResp.clientId);
        if (statusResp?.environment) setServerEnvironment(statusResp.environment);

        const merchants = Array.isArray(merchantsResp?.merchants) ? merchantsResp.merchants : [];
        setAvailableMerchants(merchants);

        const accounts = Array.isArray(accountsResp?.accounts) ? accountsResp.accounts : [];
        const nextStates: Record<number, MerchantConnectionState> = {};
        const nextCounts: Record<number, number> = {};
        for (const acc of accounts) {
          if (acc.connection_status === "connected") {
            nextStates[acc.merchant_id] = "connected";
          }
          nextCounts[acc.merchant_id] = acc.transaction_count ?? 0;
        }
        setConnectionStates(nextStates);
        setTxnCountByMerchant(nextCounts);

        // Rehydrate wizard payload from DB so Continue works immediately.
        if (accounts.some((a) => (a.transaction_count ?? 0) > 0)) {
          void persistWizardPayloadFromDb(userId);
        }

        console.log("[knot-connect] mount", {
          backendReady: nextReady,
          merchantCount: merchants.length,
          connectedAccounts: accounts.length,
          clientId: statusResp?.clientId,
          environment: statusResp?.environment,
        });

        // Stale knot_sync_cursors (empty first scrape) makes every follow-up sync return 0 forever.
        // Heal "connected but 0 txns" on load by forcing a cursor reset + Knot re-pull.
        const stuck = accounts.filter(
          (a) => a.connection_status === "connected" && (a.transaction_count ?? 0) === 0,
        );
        for (const acc of stuck) {
          console.log("[knot-connect] auto-resync stuck account", {
            merchant_id: acc.merchant_id,
            userId,
          });
          void syncKnotTransactions(userId, acc.merchant_id, 100, true)
            .then(async () => {
              const refreshed = await getKnotAccounts(userId).catch(() => ({
                accounts: [] as KnotAccountRow[],
              }));
              const list = refreshed.accounts ?? [];
              setTxnCountByMerchant((prev) => {
                const next = { ...prev };
                for (const a of list) {
                  if (a.connection_status === "connected") {
                    next[a.merchant_id] = a.transaction_count ?? 0;
                  }
                }
                return next;
              });
              if (list.some((a) => (a.transaction_count ?? 0) > 0)) {
                await persistWizardPayloadFromDb(userId);
              }
            })
            .catch((err) => {
              console.warn("[knot-connect] auto-resync failed", acc.merchant_id, err);
            });
        }
      })
      .catch((err) => {
        console.error("[knot-connect] status/merchants failed", err);
        setBackendReady(false);
        setAvailableMerchants([]);
      })
      .finally(() => setLoadingMerchants(false));
  }, [isMock, persistWizardPayloadFromDb]);

  const setMerchantConnectionState = (merchantId: number, state: MerchantConnectionState) => {
    setConnectionStates((prev) => ({ ...prev, [merchantId]: state }));
  };

  const clearMerchantConnectionState = (merchantId: number) => {
    setConnectionStates((prev) => {
      const next = { ...prev };
      delete next[merchantId];
      return next;
    });
  };

  /**
   * Poll getKnotTransactions every 2s for up to 60s, waiting for the webhook
   * to land transactions in the DB. Shows live counts and stops early when
   * two consecutive polls return the same non-zero count (i.e. sync settled).
   */
  const pollForTransactions = useCallback(
    async (merchant: DisplayMerchant, userId: string) => {
      const mid = merchant.knotMerchantId;
      if (activePollsRef.current.get(mid)) return;
      activePollsRef.current.set(mid, true);

      const intervalMs = 2000;
      // Client sync can take 40s+ on production (knot-proxy first-page retries); Amazon pagination adds more.
      const maxElapsedMs = 120_000;
      const started = Date.now();
      let lastCount = -1;
      let stableHits = 0;

      try {
        while (Date.now() - started < maxElapsedMs) {
          let count = 0;
          try {
            const resp = await getKnotTransactions(userId, mid, 500);
            count = resp?.count ?? resp?.transactions?.length ?? 0;
          } catch (err) {
            console.warn("[knot-connect] get-transactions poll failed", err);
          }

          setTxnCountByMerchant((prev) => ({ ...prev, [mid]: count }));

          if (count > 0) {
            setMerchantConnectionState(mid, "connected");
            setStatus(
              `${merchant.name} connected. Synced ${count} transaction${count === 1 ? "" : "s"} so far...`
            );
            // Refresh wizard payload so Continue button has current data.
            await persistWizardPayloadFromDb(userId);
          }

          // Early-exit once the count has been non-zero and stable twice in a row.
          if (count > 0 && count === lastCount) {
            stableHits++;
            if (stableHits >= 2) {
              setStatus(
                `${merchant.name} connected. Synced ${count} transaction${count === 1 ? "" : "s"}.`
              );
              break;
            }
          } else if (count !== lastCount) {
            stableHits = 0;
          }
          lastCount = count;

          await new Promise((r) => setTimeout(r, intervalMs));
        }

        if (lastCount <= 0) {
          setStatus(
            `${merchant.name} authenticated. Knot is still pulling your history — this can take a minute for large accounts. Leave this page open or come back later; Continue will work as soon as transactions arrive.`
          );
        }
      } finally {
        activePollsRef.current.delete(mid);
      }
    },
    [persistWizardPayloadFromDb]
  );

  const handleSyncAfterAuth = useCallback(
    (merchant: DisplayMerchant, userId: string) => {
      setMerchantConnectionState(merchant.knotMerchantId, "syncing");
      setStatus(`${merchant.name} authenticated. Pulling your purchase history...`);
      void (async () => {
        try {
          // reset_cursor clears a bad pagination cursor from an earlier empty scrape.
          const result = await syncKnotTransactions(userId, merchant.knotMerchantId, 100, true);
          const total = result?.total ?? result?.count ?? 0;
          setTxnCountByMerchant((prev) => ({ ...prev, [merchant.knotMerchantId]: total }));
          if (total > 0) {
            setMerchantConnectionState(merchant.knotMerchantId, "connected");
            setStatus(
              `${merchant.name}: synced ${total} transaction${total === 1 ? "" : "s"} from Knot.`
            );
            await persistWizardPayloadFromDb(userId);
          } else {
            setStatus(
              `${merchant.name}: Knot returned no orders yet (common right after login). Still checking…`
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[knot-connect] sync-transactions failed", e);
          setStatus(
            `${merchant.name} could not sync: ${msg}. Polling continues if data arrives via Knot.`
          );
        }
      })();
      void pollForTransactions(merchant, userId);
    },
    [pollForTransactions, persistWizardPayloadFromDb]
  );

  const handleCancelPending = (merchantId: number, merchantName: string) => {
    console.log("[knot-connect] user_cancelled_pending", { merchantId, merchantName });
    clearMerchantConnectionState(merchantId);
    setLoadingMerchantId(null);
    setStatus(
      `Cancelled connection attempt for ${merchantName}. The Knot modal may still be open in the background — close it or refresh the page.`
    );
  };

  const handleLinkMerchant = async (merchant: DisplayMerchant) => {
    console.log("[knot-connect] button_click", {
      merchantId: merchant.knotMerchantId,
      merchantName: merchant.name,
      realModeEligible,
      backendReady,
      available: merchant.available,
      isMock,
    });

    // Demo path: simulate the Knot auth/sync handshake with a short delay and
    // fill the per-merchant txn count from mockTransactions. No network calls.
    if (isMock) {
      const txns = mockTxnsByMerchant.get(merchant.knotMerchantId) ?? [];
      setMerchantConnectionState(merchant.knotMerchantId, "pending");
      setLoadingMerchantId(merchant.knotMerchantId);
      setStatus(`Opening demo login for ${merchant.name}...`);
      await new Promise((r) => setTimeout(r, 450));
      setMerchantConnectionState(merchant.knotMerchantId, "syncing");
      setStatus(`${merchant.name} authenticated. Pulling demo transactions...`);
      await new Promise((r) => setTimeout(r, 650));
      setTxnCountByMerchant((prev) => ({
        ...prev,
        [merchant.knotMerchantId]: txns.length,
      }));
      setMerchantConnectionState(merchant.knotMerchantId, "connected");
      setLoadingMerchantId(null);
      setStatus(
        txns.length > 0
          ? `${merchant.name} connected · ${txns.length} demo transaction${txns.length === 1 ? "" : "s"}.`
          : `${merchant.name} connected (no demo transactions for this merchant).`
      );
      return;
    }

    if (!realModeEligible) {
      const reason = !backendReady
        ? "Knot credentials are not configured on the edge function"
        : !clientId
          ? "no Knot client_id available from the backend"
          : "Knot is not available right now";
      setStatus(`Cannot connect ${merchant.name}: ${reason}`);
      return;
    }

    if (!merchant.available) {
      setStatus(
        `${merchant.name} (id ${merchant.knotMerchantId}) is not currently available on web. Try again later.`
      );
      return;
    }

    try {
      setMerchantConnectionState(merchant.knotMerchantId, "pending");
      setLoadingMerchantId(merchant.knotMerchantId);
      setStatus(`Creating Knot session for ${merchant.name}...`);

      const userId = getOrCreateKnotUserId();
      userIdRef.current = userId;
      const sessionResponse = await createKnotTransactionLinkSession(userId);

      if (!sessionResponse?.sessionId) {
        throw new Error("No sessionId returned from create-session");
      }

      console.log("[knot-connect] session created", {
        sessionId: sessionResponse.sessionId,
        environment: sessionResponse.environment,
        externalUserId: sessionResponse.externalUserId,
      });

      const KnotapiJS = await loadKnotSDK();
      const knot = new KnotapiJS();

      setStatus(`Opening Knot for ${merchant.name}. Complete the login in the Knot modal.`);

      /**
       * AUTHENTICATED (via onEvent) is the real success signal per Knot docs:
       * "AUTHENTICATED — merchant account successfully linked". Once we see it,
       * we start polling the DB for webhook-delivered transactions. We no
       * longer trust onSuccess alone.
       */
      let authenticatedForMerchant = false;
      let syncStarted = false;
      let onExitDebounce: ReturnType<typeof setTimeout> | null = null;
      const clearExitDebounce = () => {
        if (onExitDebounce) {
          clearTimeout(onExitDebounce);
          onExitDebounce = null;
        }
      };

      const startSyncOnce = () => {
        if (syncStarted) return;
        syncStarted = true;
        clearExitDebounce();
        handleSyncAfterAuth(merchant, sessionResponse.externalUserId || userId);
        setLoadingMerchantId(null);
      };

      knot.open({
        sessionId: sessionResponse.sessionId,
        clientId: sessionResponse.clientId || clientId,
        environment: sessionResponse.environment || environment,
        merchantIds: [merchant.knotMerchantId],
        entryPoint: "onboarding",
        useCategories: true,
        useSearch: true,
        onSuccess: (...args: unknown[]) => {
          console.log("[knot-connect] onSuccess raw_args", args);
          // v1.1.1 passes a single object; older builds pass positional args.
          // Knot documents onSuccess as "successfully authenticated". Some merchants
          // (e.g. Amazon web) complete without emitting AUTHENTICATED to onEvent;
          // still start sync so we do not stall on webhook-only ingestion.
          if (!authenticatedForMerchant) {
            console.warn(
              "[knot-connect] onSuccess without prior AUTHENTICATED onEvent — starting sync anyway",
              { merchant: merchant.name, args }
            );
            authenticatedForMerchant = true;
          }
          startSyncOnce();
        },
        onEvent: (...args: unknown[]) => {
          console.log("[knot-connect] onEvent raw_args", args);
          // The Web SDK signature has shifted across versions:
          //   v1.1.x: onEvent(eventObj)  where eventObj = { event, merchant, merchantId, taskId, metaData, ... }
          //   v1.0.x: onEvent(event, merchant, merchantId, payload, taskId)
          //   older:  onEvent(event, merchantId)
          // Normalise into { event, merchantId } regardless of which one we got.
          let event = "";
          let eventMerchantId: number | null = null;

          const first = args[0];
          if (first && typeof first === "object") {
            const obj = first as Record<string, unknown>;
            const name =
              (typeof obj.event === "string" && obj.event) ||
              (typeof obj.name === "string" && obj.name) ||
              "";
            event = name;
            const midRaw =
              obj.merchantId ?? obj.merchant_id ?? obj.merchantID ?? null;
            if (typeof midRaw === "number") {
              eventMerchantId = midRaw;
            } else if (typeof midRaw === "string" && /^\d+$/.test(midRaw)) {
              eventMerchantId = Number(midRaw);
            }
          } else if (typeof first === "string") {
            event = first;
            const midAt2 = typeof args[2] === "number" ? (args[2] as number) : null;
            const midAt1 = typeof args[1] === "number" ? (args[1] as number) : null;
            eventMerchantId = midAt2 ?? midAt1;
          }

          if (event === "LOGIN_STARTED") {
            setStatus(`Logging into ${merchant.name}...`);
          } else if (event === "AUTHENTICATED") {
            if (
              eventMerchantId === null ||
              eventMerchantId === merchant.knotMerchantId
            ) {
              authenticatedForMerchant = true;
              setStatus(`${merchant.name} authenticated. Fetching transactions...`);
              startSyncOnce();
            } else {
              console.warn(
                "[knot-connect] AUTHENTICATED for unexpected merchant id",
                { expected: merchant.knotMerchantId, got: eventMerchantId }
              );
            }
          } else if (event === "OTP_REQUIRED" || event === "QUESTIONS_REQUIRED") {
            setStatus(`Additional verification required for ${merchant.name}.`);
          } else if (event === "MERCHANT_CLICKED") {
            setStatus(`Preparing ${merchant.name} login...`);
          } else if (event === "ACCOUNT_LOGIN_REQUIRED") {
            clearExitDebounce();
            authenticatedForMerchant = false;
            syncStarted = false;
            clearMerchantConnectionState(merchant.knotMerchantId);
            setLoadingMerchantId(null);
            setStatus(
              `${merchant.name} needs you to sign in again. Tap Connect when you are ready.`
            );
          } else if (event === "REFRESH_SESSION_REQUEST") {
            setStatus(`Keeping your ${merchant.name} session active — continue in the Knot window.`);
          }
        },
        onExit: (...args: unknown[]) => {
          console.log("[knot-connect] onExit raw_args", args);
          if (authenticatedForMerchant) return;
          // Amazon / embedded OAuth often fires onExit during in-modal redirects; do not
          // reset UI immediately or the user gets bounced back to "Connect" mid-login.
          clearExitDebounce();
          onExitDebounce = setTimeout(() => {
            onExitDebounce = null;
            if (!authenticatedForMerchant) {
              clearMerchantConnectionState(merchant.knotMerchantId);
              setLoadingMerchantId(null);
              setStatus(
                `Knot closed before ${merchant.name} was authenticated. Click Connect to try again.`
              );
            }
          }, 2500);
        },
        onError: (...errArgs: unknown[]) => {
          console.error("[knot-connect] onError raw_args", errArgs);
          clearExitDebounce();
          clearMerchantConnectionState(merchant.knotMerchantId);
          setLoadingMerchantId(null);

          // Knot occasionally passes an object as errorCode instead of a string.
          // Normalise both args into a readable description.
          const rawCode = errArgs[0];
          const rawMsg = errArgs[1];
          const describe = (v: unknown): string => {
            if (v == null) return "";
            if (typeof v === "string") return v;
            if (v instanceof Error) return v.message;
            if (typeof v === "object") {
              const anyV = v as Record<string, unknown>;
              const candidate =
                anyV.message ?? anyV.error ?? anyV.code ?? anyV.type ?? null;
              if (typeof candidate === "string") return candidate;
              try {
                return JSON.stringify(v);
              } catch {
                return String(v);
              }
            }
            return String(v);
          };
          const codeStr = describe(rawCode);
          const msgStr = describe(rawMsg);
          const combined = [codeStr, msgStr].filter(Boolean).join(" — ");

          const isChunkLoadError =
            /failed to fetch dynamically imported module|loading chunk|assets\//i.test(
              combined
            );

          if (isChunkLoadError) {
            setStatus(
              `Knot SDK failed to load (${combined || "chunk error"}). Try: hard refresh (Ctrl+Shift+R), disable ad-blockers for the Knot CDN, or retry in a moment.`
            );
          } else {
            setStatus(
              `${merchant.name} error: ${
                combined || "Unable to initialize TransactionLink"
              }`
            );
          }
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start Knot";
      console.error("[knot-connect] link failure", error);
      clearMerchantConnectionState(merchant.knotMerchantId);
      setLoadingMerchantId(null);
      setStatus(`Knot unavailable for ${merchant.name}: ${message}`);
    }
  };

  const totalRealTransactions = Object.values(txnCountByMerchant).reduce(
    (a, b) => a + (b ?? 0),
    0
  );

  const handleProceed = async () => {
    // Demo path: pass through mockTransactions for the merchants the user
    // "connected" in demo mode. Falls back to all mockTransactions if they
    // somehow clicked Continue with nothing connected.
    if (isMock) {
      const connectedIds = Object.entries(connectionStates)
        .filter(([, state]) => state === "connected")
        .map(([id]) => Number(id));
      const connectedMerchantNames = new Set<string>(
        TARGET_MERCHANTS.filter((t) => connectedIds.includes(t.id)).map((t) =>
          t.name.toLowerCase()
        )
      );
      const filtered = mockTransactions.filter((t) =>
        connectedMerchantNames.has((t.merchant ?? "").toLowerCase())
      );
      const payload = filtered.length > 0 ? filtered : mockTransactions;
      onNext(payload);
      return;
    }

    const userId = userIdRef.current || getOrCreateKnotUserId();
    try {
      const count = await persistWizardPayloadFromDb(userId);
      if (count > 0) {
        const raw = localStorage.getItem(KNOT_WIZARD_TRANSACTIONS_KEY);
        const parsed = raw ? (JSON.parse(raw) as Transaction[]) : [];
        onNext(parsed);
        return;
      }
    } catch (err) {
      console.error("[knot-connect] handleProceed refresh failed", err);
    }
    setStatus(
      "No real transactions have arrived yet. Give Knot a moment and try again."
    );
  };

  const connectedCount = Object.values(connectionStates).filter((s) => s === "connected").length;

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
      <p className="text-xs text-muted-foreground/80 mb-10">
        Powered by <span className="font-medium text-foreground">Knot</span>
      </p>

      {/* Merchant rows */}
      <div className="mb-8">
        {loadingMerchants ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading merchants...</span>
          </div>
        ) : (
          displayMerchants.map((merchant, i) => {
            const connectionState = connectionStates[merchant.knotMerchantId];
            const isConnected = connectionState === "connected";
            const isLoadingThis = loadingMerchantId === merchant.knotMerchantId;
            const Icon = getIcon(merchant);
            const merchantTxnCount = txnCountByMerchant[merchant.knotMerchantId];

            return (
              <motion.div
                key={merchant.knotMerchantId}
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
                      {!merchant.available && backendReady && (
                        <Badge variant="secondary">Unavailable</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{merchant.subtitle}</p>
                  </div>
                </div>

                {connectionState === "pending" ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Waiting for login...
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCancelPending(merchant.knotMerchantId, merchant.name)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label={`Cancel ${merchant.name} connection`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : connectionState === "syncing" ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Syncing
                    {typeof merchantTxnCount === "number" && merchantTxnCount > 0 && (
                      <span className="text-muted-foreground font-normal">
                        · {merchantTxnCount} txns
                      </span>
                    )}
                  </span>
                ) : isConnected ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Connected
                    {typeof merchantTxnCount === "number" && (
                      <span className="text-muted-foreground font-normal">
                        · {merchantTxnCount} txns
                      </span>
                    )}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLinkMerchant(merchant)}
                    disabled={
                      loadingMerchantId !== null ||
                      !merchant.available ||
                      (!isMock && !realModeEligible)
                    }
                    className="text-xs h-8"
                  >
                    {isLoadingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
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

      {!backendReady && !isMock && !loadingMerchants && (
        <p className="text-xs text-destructive mb-4">
          Knot backend is not reachable. Make sure the{" "}
          <code className="text-[11px]">knot-proxy</code> edge function is deployed and{" "}
          <code className="text-[11px]">KNOT_CLIENT_ID</code> /{" "}
          <code className="text-[11px]">KNOT_SECRET</code> secrets are set.
        </p>
      )}

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
        {connectedCount > 0 && (
          <Button
            onClick={handleProceed}
            disabled={!isMock && totalRealTransactions === 0}
            className="gap-2 font-semibold"
          >
            Continue with {totalRealTransactions} {isMock ? "demo" : "real"} transaction
            {totalRealTransactions === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
