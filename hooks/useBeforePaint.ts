import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect`, except on the server, where it warns.
 *
 * The distinction is not cosmetic: a layout effect runs after the DOM is committed and BEFORE
 * the browser paints, so anything set in one is on screen in the first frame the user sees. A
 * passive `useEffect` runs after paint, which means one frame of the wrong thing followed by a
 * visible jump — which is the entire difference between reserving a layout and shifting it.
 *
 * It has to degrade on the server because `app/page.tsx` is a client component that Next still
 * PRERENDERS, and React warns loudly about `useLayoutEffect` there. The ternary is evaluated at
 * module scope rather than inside the hook so the choice is fixed per environment and the hook
 * order can never change between renders.
 *
 * Extracted from `app/page.tsx`, which had the only copy, when `components/learn/LearnTab.tsx`
 * needed the same guarantee for the course path. Two copies of a one-line environment check is
 * how they come to disagree about which environment they are in.
 */
export const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
