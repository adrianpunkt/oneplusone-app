"use client";

import {
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

export type ToastVariant = "error" | "info" | "success";

export type ToastInput = {
  description?: string;
  duration?: number;
  id?: string;
  title: string;
  variant?: ToastVariant;
};

type ToastItem = Required<Pick<ToastInput, "duration" | "id" | "title">> &
  Pick<ToastInput, "description"> & {
    variant: ToastVariant;
  };

type ToastContextValue = {
  dismissToast: (id: string) => void;
  showToast: (toast: ToastInput) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const defaultDuration = 4200;

const toastVariantStyles: Record<
  ToastVariant,
  {
    icon: LucideIcon;
    iconClassName: string;
    ringClassName: string;
  }
> = {
  error: {
    icon: AlertCircle,
    iconClassName: "bg-lipstick text-white",
    ringClassName: "border-lipstick/25",
  },
  info: {
    icon: Info,
    iconClassName: "bg-gold text-white",
    ringClassName: "border-gold/30",
  },
  success: {
    icon: CheckCircle2,
    iconClassName: "bg-ocean text-white",
    ringClassName: "border-ocean/20",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);
  const timeoutRefs = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timeout = timeoutRefs.current.get(id);
    if (timeout) window.clearTimeout(timeout);
    timeoutRefs.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      description,
      duration = defaultDuration,
      id,
      title,
      variant = "success",
    }: ToastInput) => {
      const toastId =
        id || `toast-${Date.now()}-${(counterRef.current += 1)}`;
      const toast: ToastItem = {
        description,
        duration,
        id: toastId,
        title,
        variant,
      };

      const existingTimeout = timeoutRefs.current.get(toastId);
      if (existingTimeout) window.clearTimeout(existingTimeout);

      setToasts((current) => [
        toast,
        ...current.filter((item) => item.id !== toastId),
      ]);

      timeoutRefs.current.set(
        toastId,
        window.setTimeout(() => dismissToast(toastId), duration),
      );

      return toastId;
    },
    [dismissToast],
  );

  useEffect(() => {
    const timeouts = timeoutRefs.current;

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ dismissToast, showToast }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[80] grid justify-items-center gap-3 px-3 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[min(24rem,calc(100vw-2rem))] sm:justify-items-stretch sm:px-0"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }

  return context;
}

function ToastCard({
  onDismiss,
  toast,
}: {
  onDismiss: (id: string) => void;
  toast: ToastItem;
}) {
  const styles = toastVariantStyles[toast.variant];
  const Icon = styles.icon;
  const role = toast.variant === "error" ? "alert" : "status";

  return (
    <div
      className={cn(
        "pointer-events-auto grid w-full max-w-[calc(100vw-1.5rem)] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border bg-white p-4 text-wine shadow-[0_18px_45px_rgba(68,10,18,0.16)]",
        styles.ringClassName,
      )}
      role={role}
    >
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full",
          styles.iconClassName,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2.6} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5 text-wine">{toast.title}</p>
        {toast.description ? (
          <p className="mt-1 text-sm leading-5 text-muted">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        aria-label="Dismiss notification"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-blush hover:text-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/35"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
