/**
 * useMobile — backwards-compatible wrapper around the responsive system.
 * Existing modules that import useMobile keep working unchanged.
 * New modules should import useBreakpoint from responsive.js instead.
 */
export { useBreakpoint as default } from "./responsive.js";

import { useState, useEffect } from "react";

// Legacy named export — returns simple boolean (isMobile)
export function useMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    let raf;
    const fn = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setMobile(window.innerWidth < bp)); };
    window.addEventListener("resize", fn, { passive: true });
    return () => { window.removeEventListener("resize", fn); cancelAnimationFrame(raf); };
  }, [bp]);
  return mobile;
}
