// Payer approval through the PayPal JS SDK v6 in live mode. In replay mode the
// same flow runs with a clearly labelled simulated approval.
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { useDesk } from "../lib/api";
import { Btn, useToast } from "./ui";

declare global {
  interface Window {
    paypal?: any;
  }
}

const POPUP_TIMEOUT_MS = 45_000;

let sdkScript: Promise<void> | null = null;
let sdkInstance: Promise<any> | null = null;

function loadScript(): Promise<void> {
  sdkScript ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      sdkScript = null;
      reject(new Error("Could not load PayPal JS SDK v6"));
    };
    document.head.appendChild(s);
  });
  return sdkScript;
}

function instance(): Promise<any> {
  sdkInstance ??= (async () => {
    await loadScript();
    const { clientToken } = await api<{ clientToken: string }>("/paypal/client-token");
    return window.paypal.createInstance({ clientToken, components: ["paypal-payments"], pageType: "checkout" });
  })().catch((e) => {
    sdkInstance = null;
    throw e;
  });
  return sdkInstance;
}

export function PayPalApprove(props: { label: string; orderId?: string; createOrder?: () => Promise<{ orderId: string }>; onApproved: (orderId: string) => Promise<unknown>; sm?: boolean }) {
  const { state } = useDesk();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const live = state?.mode === "live";
  // Settles the open popup session when the user cancels or it times out.
  const abort = useRef<((reason: Error) => void) | null>(null);

  async function start() {
    setBusy(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const orderPromise = props.orderId ? Promise.resolve({ orderId: props.orderId }) : props.createOrder!();
      if (!live) {
        const { orderId } = await orderPromise;
        await props.onApproved(orderId);
        return;
      }
      // Cancel and the timeout settle this race from the first click, including while the
      // SDK is still loading, so a blocked or closed popup never leaves the button spinning.
      const stopped = new Promise<never>((_, reject) => {
        abort.current = reject;
        timer = setTimeout(() => reject(new Error(`No response from the PayPal window after ${POPUP_TIMEOUT_MS / 1000}s. If you finish approving there, the hold still updates.`)), POPUP_TIMEOUT_MS);
      });
      const sdk = await Promise.race([instance(), stopped]);
      await Promise.race([stopped, new Promise<void>((resolve, reject) => {
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async (data: { orderId: string }) => {
            try {
              await props.onApproved(data.orderId);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          onCancel: () => reject(new Error("Payer closed the PayPal window")),
          onError: (e: unknown) => reject(e instanceof Error ? e : new Error("PayPal checkout error")),
        });
        session.start({ presentationMode: "auto" }, orderPromise).catch(reject);
      })]);
    } catch (e) {
      toast({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      clearTimeout(timer);
      abort.current = null;
      setBusy(false);
    }
  }

  return (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <Btn kind="primary" sm={props.sm} busy={busy} onClick={start} title={live ? "Opens PayPal Sandbox checkout (JS SDK v6)" : "Replay mode: simulates the payer approving in PayPal"}>
        {live ? props.label : `${props.label} (simulated)`}
      </Btn>
      {busy && live && (
        <Btn sm kind="ghost" onClick={() => abort.current?.(new Error("PayPal approval cancelled"))} title="Stop waiting for the PayPal window">
          Cancel
        </Btn>
      )}
    </span>
  );
}
