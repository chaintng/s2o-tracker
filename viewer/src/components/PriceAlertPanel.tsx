import { FormEvent } from "react";
import { TicketKey, ticketShortLabel } from "../types";

interface PriceAlertPanelProps {
  activeTicket: TicketKey | null;
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
  onOpen: () => Promise<void>;
  onClose: () => void;
  onLowerBoundChange: (value: string) => void;
  onUpperBoundChange: (value: string) => void;
  onSubmit: () => Promise<void>;
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 3.75a4.5 4.5 0 0 0-4.5 4.5v1.29c0 .74-.2 1.46-.58 2.1l-1.2 2.02a1.5 1.5 0 0 0 1.29 2.27h10a1.5 1.5 0 0 0 1.29-2.27l-1.2-2.02a4.1 4.1 0 0 1-.58-2.1V8.25a4.5 4.5 0 0 0-4.5-4.5ZM9.9 18a2.25 2.25 0 0 0 4.2 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function PriceAlertPanel({
  activeTicket,
  isSupported,
  permission,
  isOpen,
  isBusy,
  error,
  success,
  lowerBound,
  upperBound,
  lowerBoundPlaceholder,
  upperBoundPlaceholder,
  hasSavedAlert,
  onOpen,
  onClose,
  onLowerBoundChange,
  onUpperBoundChange,
  onSubmit,
}: PriceAlertPanelProps) {
  const isHighlighted = hasSavedAlert || isOpen;
  const buttonLabel = hasSavedAlert ? "Edit price alert" : "Set price alert";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit();
  }

  return (
    <div className="price-alert-wrap">
      <button
        type="button"
        onClick={() => void onOpen()}
        disabled={!activeTicket || isBusy || !isSupported}
        className={`alert-bell-btn ${isHighlighted ? "alert-bell-btn-active" : ""}`}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <BellIcon />
      </button>

      {isOpen ? (
        <div className="alert-modal" role="dialog" aria-modal="true" aria-labelledby="price-alert-title">
          <button type="button" className="alert-backdrop" aria-label="Close alert popup" onClick={onClose} />

          <form onSubmit={handleSubmit} className="alert-card alert-card-modal">
            <div className="alert-card-header">
              <div>
                <p className="market-kicker">Price alert</p>
                <h2 id="price-alert-title" className="alert-title">
                  {activeTicket ? ticketShortLabel(activeTicket) : "Ticket alert"}
                </h2>
              </div>
              <button type="button" onClick={onClose} className="alert-close-btn" aria-label="Close alert popup">
                ✕
              </button>
            </div>

            <div className="alert-field-grid">
              <label className="alert-field">
                <span>Lower bound</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder={lowerBoundPlaceholder}
                  value={lowerBound}
                  onChange={(event) => onLowerBoundChange(event.target.value)}
                  className="alert-input"
                />
              </label>

              <label className="alert-field">
                <span>Upper bound</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder={upperBoundPlaceholder}
                  value={upperBound}
                  onChange={(event) => onUpperBoundChange(event.target.value)}
                  className="alert-input"
                />
              </label>
            </div>

            {error ? <p className="alert-message alert-message-error">{error}</p> : null}
            {success ? <p className="alert-message alert-message-success">{success}</p> : null}

            <button type="submit" disabled={isBusy} className="alert-submit-btn">
              {isBusy ? "Saving..." : "Save alert"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
