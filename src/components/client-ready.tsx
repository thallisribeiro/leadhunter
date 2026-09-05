"use client";

import { useEffect } from "react";

export function ClientReady() {
  useEffect(() => {
    document.documentElement.dataset.clientReady = "true";
    return () => { delete document.documentElement.dataset.clientReady; };
  }, []);
  return null;
}
