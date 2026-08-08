/**
 * Setup for the jsdom (component) project.
 *
 * framer-motion is stubbed rather than run for real: its animations rely on
 * layout APIs jsdom doesn't implement, and animating is not what these tests are
 * checking. Every `motion.x` becomes a plain `x` that forwards children and
 * drops animation-only props, so assertions run against real DOM.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import React from "react";

afterEach(() => cleanup());

// Props that only mean something to framer-motion — stripped before they reach
// the DOM, which would otherwise warn about unknown attributes.
const MOTION_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants", "whileHover",
  "whileTap", "whileInView", "viewport", "layout", "layoutId", "custom",
  "whileFocus", "whileDrag", "drag", "onAnimationComplete",
]);

vi.mock("framer-motion", () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.has(k)));

  // Components MUST be cached per tag. Returning a fresh function on every
  // property access gives React a new component type each render, which
  // remounts the whole subtree — inputs lose their value and focus mid-typing,
  // and controlled elements desync. That looks exactly like an app bug.
  const cache = new Map<string, React.ComponentType<{ children?: React.ReactNode }>>();

  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        const Component = ({ children, ...props }: { children?: React.ReactNode }) =>
          React.createElement(tag, strip(props as Record<string, unknown>), children);
        Component.displayName = `motion.${tag}`;
        cache.set(tag, Component);
      }
      return cache.get(tag);
    },
  });

  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
  };
});
