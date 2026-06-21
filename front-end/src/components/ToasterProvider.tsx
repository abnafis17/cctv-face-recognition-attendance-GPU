"use client";

import { useEffect } from "react";
import { Toaster, useToasterStore, toast } from "react-hot-toast";

const TOAST_LIMIT = 1;

export function ToasterProvider() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    // Filter visible toasts
    const visibleToasts = toasts.filter((t) => t.visible);
    
    // If we exceed the limit, dismiss the oldest ones
    if (visibleToasts.length > TOAST_LIMIT) {
      // Dismiss all but the latest toast
      visibleToasts.slice(0, visibleToasts.length - TOAST_LIMIT).forEach((t) => {
        toast.dismiss(t.id);
      });
    }
  }, [toasts]);

  return <Toaster position="top-center" />;
}
