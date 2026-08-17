declare module "@juspay-tech/react-hyper-js" {
  import type { ComponentType, ReactNode } from "react";

  interface HyperElementsProps {
    hyper: Promise<unknown>;
    options: Record<string, unknown>;
    children: ReactNode;
  }

  interface PaymentElementProps {
    id?: string;
    options?: Record<string, unknown>;
    onChange?: (event: unknown) => void;
    onReady?: (event: unknown) => void;
  }

  interface ConfirmResult { error?: { message?: string } }
  interface HyperClient {
    confirmPayment(options: { elements: unknown; confirmParams: { return_url: string }; redirect: "always" | "if_required" }): Promise<ConfirmResult>;
  }

  export const HyperElements: ComponentType<HyperElementsProps>;
  export const PaymentElement: ComponentType<PaymentElementProps>;
  export function useHyper(): HyperClient | null;
  export function useWidgets(): unknown | null;
}
