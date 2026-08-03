"use client";

export type DashMode = "carry" | "radar";

type Props = {
  mode: DashMode;
  onMode: (m: DashMode) => void;
};

export function ModeTabs({ mode, onMode }: Props) {
  return (
    <div className="mode-tabs fade d1" role="tablist" aria-label="Dashboard mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "carry"}
        className="mode-tab"
        onClick={() => onMode("carry")}
      >
        Stay carry
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "radar"}
        className="mode-tab"
        onClick={() => onMode("radar")}
      >
        Positioning radar
      </button>
    </div>
  );
}
