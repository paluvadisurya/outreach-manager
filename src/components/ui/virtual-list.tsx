"use client";

import * as React from "react";

interface VirtualListProps<T> {
  items: T[];
  /** Fixed row height in pixels. */
  itemHeight: number;
  /** Render a single row. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key for a row. */
  getKey: (item: T, index: number) => string;
  /** Extra rows rendered above/below the viewport to smooth fast scrolling. */
  overscan?: number;
  className?: string;
}

/**
 * A minimal fixed-height virtual list. Only the rows visible in the scroll
 * viewport (plus a small overscan) are mounted, so a list of tens of thousands
 * of contacts scrolls smoothly with a near-constant DOM size.
 */
export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  getKey,
  overscan = 6,
  className,
}: VirtualListProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewport, setViewport] = React.useState(0);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewport(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = items.length * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(viewport / itemHeight) + overscan * 2;
  const end = Math.min(items.length, start + visibleCount);
  const slice = items.slice(start, end);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={className}
      style={{ overflowY: "auto" }}
    >
      <div style={{ height: total, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: start * itemHeight,
            left: 0,
            right: 0,
          }}
        >
          {slice.map((item, i) => {
            const index = start + i;
            return (
              <div key={getKey(item, index)} style={{ height: itemHeight }}>
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
