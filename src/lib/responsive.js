/**
 * Atolon OS — Responsive Design System
 * ─────────────────────────────────────
 * Single source of truth for all layout, spacing, and breakpoint decisions.
 * Every module MUST import from here — never hardcode breakpoints or spacing.
 *
 * RULE: Mobile-first. Start with mobile, enhance upward.
 */

import { useState, useEffect } from "react";

// ─── Breakpoints ──────────────────────────────────────────────────────────────
// Matches: xs=phone-small, sm=phone-large, md=tablet, lg=laptop, xl=desktop
export const BP = {
  xs: 375,   // small phones (iPhone SE)
  sm: 480,   // large phones
  md: 768,   // tablets portrait
  lg: 1024,  // tablets landscape / small laptops
  xl: 1280,  // laptops
  xxl: 1536, // large desktops
};

// ─── Hook: full breakpoint state ──────────────────────────────────────────────
// Usage: const { isMobile, isTablet, isDesktop, width } = useBreakpoint();
export function useBreakpoint() {
  const getState = () => {
    if (typeof window === "undefined") return { width: 1280, isMobile: false, isTablet: false, isDesktop: true, isXs: false, isSm: false, isMd: false, isLg: true, isXl: true };
    const w = window.innerWidth;
    return {
      width: w,
      isXs:      w < BP.xs,
      isSm:      w < BP.sm,
      isMobile:  w < BP.md,   // < 768 — phone
      isTablet:  w >= BP.md && w < BP.lg,  // 768–1023
      isDesktop: w >= BP.lg,  // 1024+
      isMd:      w >= BP.md,
      isLg:      w >= BP.lg,
      isXl:      w >= BP.xl,
    };
  };

  const [state, setState] = useState(getState);

  useEffect(() => {
    let raf;
    const fn = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setState(getState())); };
    window.addEventListener("resize", fn, { passive: true });
    return () => { window.removeEventListener("resize", fn); cancelAnimationFrame(raf); };
  }, []);

  return state;
}

// ─── Spacing scale ────────────────────────────────────────────────────────────
// Use S.md, S.lg, etc. instead of hardcoded pixels.
// Adapts automatically based on screen size via spacing() helper.
export const S = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl:32,
  section: 40,
};

// Returns responsive spacing: smaller on mobile, larger on desktop
export const spacing = (base, { isMobile, isTablet } = {}) => {
  if (isMobile) return Math.max(4, Math.round(base * 0.75));
  if (isTablet) return Math.round(base * 0.875);
  return base;
};

// ─── Typography scale ─────────────────────────────────────────────────────────
export const T = {
  xs:   11,
  sm:   12,
  base: 13,
  md:   14,
  lg:   16,
  xl:   18,
  xxl:  22,
  h3:   20,
  h2:   24,
  h1:   28,
};

// ─── Touch target minimum (iOS/Android HIG) ───────────────────────────────────
export const TOUCH_TARGET = 44; // px — minimum tap area

// ─── Layout helpers ───────────────────────────────────────────────────────────

// Responsive padding for page content areas
export const pagePadding = ({ isMobile, isTablet } = {}) => ({
  padding: isMobile ? "12px" : isTablet ? "16px 20px" : "24px 28px",
});

// Responsive card padding
export const cardPadding = ({ isMobile } = {}) => ({
  padding: isMobile ? "12px" : "16px 20px",
});

// Full-width container with max-width cap for large screens
export const container = ({ maxWidth = 1400 } = {}) => ({
  width: "100%",
  maxWidth,
  marginLeft: "auto",
  marginRight: "auto",
  boxSizing: "border-box",
});

// Responsive grid: 1 col mobile → 2 col tablet → N col desktop
export const responsiveGrid = ({ cols = 3, gap = 16, minWidth = 260 } = {}) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
  gap,
});

// Responsive flex row that stacks on mobile
export const flexRow = ({ gap = 12, mobileStack = true, isMobile = false } = {}) => ({
  display: "flex",
  flexDirection: (mobileStack && isMobile) ? "column" : "row",
  gap,
  flexWrap: "wrap",
  alignItems: (mobileStack && isMobile) ? "stretch" : "flex-start",
});

// Standard input style (responsive)
export const inputStyle = ({ isMobile } = {}) => ({
  width: "100%",
  padding: isMobile ? "10px 12px" : "9px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "#1E3566",
  color: "#fff",
  fontSize: T.base,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  minHeight: TOUCH_TARGET,
});

// Standard button — touch-friendly
export const btnPrimary = ({ isMobile } = {}) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: isMobile ? "12px 16px" : "10px 20px",
  minHeight: TOUCH_TARGET,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: T.base,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

// Standard button — secondary/ghost
export const btnSecondary = (props) => ({
  ...btnPrimary(props),
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(255,255,255,0.12)",
});

// Modal overlay + container
export const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  overflowY: "auto",
};

export const modalBox = ({ isMobile, maxWidth = 560 } = {}) => ({
  background: "#152650",
  borderRadius: isMobile ? 16 : 20,
  padding: isMobile ? 20 : 28,
  width: "100%",
  maxWidth,
  maxHeight: "90vh",
  overflowY: "auto",
  boxSizing: "border-box",
  position: "relative",
});

// Table wrapper — enables horizontal scroll on mobile without breaking layout
export const tableWrapper = {
  width: "100%",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

// Section card
export const sectionCard = ({ isMobile } = {}) => ({
  background: "#152650",
  borderRadius: isMobile ? 12 : 16,
  padding: isMobile ? "14px" : "20px 24px",
  marginBottom: isMobile ? 12 : 16,
});

// Label style (form labels)
export const labelStyle = {
  fontSize: T.xs,
  color: "rgba(255,255,255,0.5)",
  display: "block",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// ─── Responsive table → cards on mobile ──────────────────────────────────────
// Use this pattern: if (isMobile) render cards, else render table
// Example: see MuelleCheckin for reference implementation

// ─── Safe image ───────────────────────────────────────────────────────────────
export const imgResponsive = {
  maxWidth: "100%",
  height: "auto",
  display: "block",
};

// ─── No horizontal overflow guard ─────────────────────────────────────────────
// Apply to root containers to prevent horizontal scroll
export const noOverflow = {
  width: "100%",
  maxWidth: "100vw",
  overflowX: "hidden",
  boxSizing: "border-box",
};
