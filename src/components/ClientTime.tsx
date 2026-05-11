"use client";

import { useEffect, useState } from "react";

export function ClientTime({ value, dateTime = false }: { value: string; dateTime?: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <time dateTime={value}>{value.slice(11, 16)}</time>;
  }

  const date = new Date(value);
  return <time dateTime={value}>{dateTime ? date.toLocaleString() : date.toLocaleTimeString()}</time>;
}
