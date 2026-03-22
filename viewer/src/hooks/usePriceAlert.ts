import { useEffect, useState } from "react";
import { fetchPriceAlert, savePriceAlert } from "../lib/priceAlertApi";
import { ensurePushSubscription, isNotificationSupported } from "../lib/notifications";
import { StoredPushSubscription, TicketKey } from "../types";

interface UsePriceAlertReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  isOpen: boolean;
  isBusy: boolean;
  error: string | null;
  success: string | null;
  lowerBound: string;
  upperBound: string;
  lowerBoundPlaceholder: string;
  upperBoundPlaceholder: string;
  hasSavedAlert: boolean;
  handleBellClick: () => Promise<void>;
  handleClose: () => void;
  handleLowerBoundChange: (value: string) => void;
  handleUpperBoundChange: (value: string) => void;
  handleSubmit: () => Promise<void>;
}

function getDefaultBounds(spotPrice: number | null): { lowerBound: string; upperBound: string } {
  if (spotPrice === null) {
    return {
      lowerBound: "",
      upperBound: "",
    };
  }

  const lowerBound = Math.max(100, Math.floor((spotPrice * 0.9) / 100) * 100);
  const upperBound = Math.max(100, Math.ceil((spotPrice * 1.1) / 100) * 100);

  return {
    lowerBound: lowerBound.toString(),
    upperBound: upperBound.toString(),
  };
}

function parseBound(value: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  if (!/^\d+$/.test(trimmedValue)) {
    throw new Error("Bounds must be whole numbers.");
  }

  const parsedValue = Number.parseInt(trimmedValue, 10);

  if (parsedValue <= 0) {
    throw new Error("Bounds must be greater than zero.");
  }

  return parsedValue;
}

export function usePriceAlert(
  activeTicket: TicketKey | null,
  currentSpotPrice: number | null
): UsePriceAlertReturn {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [subscription, setSubscription] = useState<StoredPushSubscription | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lowerBound, setLowerBound] = useState("");
  const [upperBound, setUpperBound] = useState("");
  const [hasSavedAlert, setHasSavedAlert] = useState(false);
  const isSupported = isNotificationSupported();
  const defaultBounds = getDefaultBounds(currentSpotPrice);

  useEffect(() => {
    setSuccess(null);
    setError(null);
    setHasSavedAlert(false);
    setLowerBound(defaultBounds.lowerBound);
    setUpperBound(defaultBounds.upperBound);
  }, [activeTicket, defaultBounds.lowerBound, defaultBounds.upperBound]);

  useEffect(() => {
    async function loadAlert(ticket: TicketKey, pushSubscription: StoredPushSubscription) {
      setIsBusy(true);
      setError(null);

      try {
        const alert = await fetchPriceAlert({
          ticket,
          pushEndpoint: pushSubscription.endpoint,
        });

        setLowerBound(alert?.lower_bound?.toString() ?? defaultBounds.lowerBound);
        setUpperBound(alert?.upper_bound?.toString() ?? defaultBounds.upperBound);
        setHasSavedAlert(alert !== null && alert.is_active);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load price alert.";
        setError(message);
      } finally {
        setIsBusy(false);
      }
    }

    if (!activeTicket || !subscription || !isOpen) {
      return;
    }

    void loadAlert(activeTicket, subscription);
  }, [activeTicket, isOpen, subscription, defaultBounds.lowerBound, defaultBounds.upperBound]);

  async function handleBellClick(): Promise<void> {
    if (!activeTicket) {
      return;
    }

    if (isOpen) {
      setIsOpen(false);
      setError(null);
      setSuccess(null);
      return;
    }

    setIsOpen(true);
    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const nextSubscription = await ensurePushSubscription();

      setSubscription(nextSubscription);
      setPermission(Notification.permission);
      setIsOpen(true);
    } catch (subscriptionError) {
      const message =
        subscriptionError instanceof Error
          ? subscriptionError.message
          : "Failed to enable notifications.";
      setPermission(typeof Notification !== "undefined" ? Notification.permission : "default");
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }

  function handleClose(): void {
    setIsOpen(false);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(): Promise<void> {
    if (!activeTicket || !subscription) {
      setError("Notification subscription is not ready yet.");
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const parsedLowerBound = parseBound(lowerBound);
      const parsedUpperBound = parseBound(upperBound);

      if (parsedLowerBound === null && parsedUpperBound === null) {
        throw new Error("Set at least one bound.");
      }

      if (
        parsedLowerBound !== null &&
        parsedUpperBound !== null &&
        parsedLowerBound >= parsedUpperBound
      ) {
        throw new Error("Lower bound must be lower than upper bound.");
      }

      await savePriceAlert({
        ticket: activeTicket,
        lowerBound: parsedLowerBound,
        upperBound: parsedUpperBound,
        pushSubscription: subscription,
      });

      setHasSavedAlert(true);
      setSuccess("Alert saved for this device.");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to save price alert.";
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }

  return {
    isSupported,
    permission,
    isOpen,
    isBusy,
    error,
    success,
    lowerBound,
    upperBound,
    lowerBoundPlaceholder: defaultBounds.lowerBound,
    upperBoundPlaceholder: defaultBounds.upperBound,
    hasSavedAlert,
    handleBellClick,
    handleClose,
    handleLowerBoundChange: setLowerBound,
    handleUpperBoundChange: setUpperBound,
    handleSubmit,
  };
}
