import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Wraps an irreversible admin action in a confirmation step, optionally
 * collecting the reason that gets written to the audit trail.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <span
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
      >
        {trigger}
      </span>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {reasonLabel ? (
            <div>
              <Label htmlFor="confirm-reason">{reasonLabel}</Label>
              <Textarea
                id="confirm-reason"
                value={reason}
                maxLength={300}
                placeholder={reasonPlaceholder}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={() => {
                  onConfirm(reason.trim());
                  setOpen(false);
                }}
              >
                {confirmLabel}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
