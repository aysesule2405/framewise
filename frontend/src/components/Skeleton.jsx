import "./Skeleton.css";

export function SkeletonCard() {
  return (
    <div className="sk-card" aria-hidden="true">
      <div className="sk-thumb sk-pulse" />
      <div className="sk-body">
        <div className="sk-line sk-pulse" style={{ width: "80%" }} />
        <div className="sk-line sk-pulse" style={{ width: "50%" }} />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="sk-row" aria-hidden="true">
      <div className="sk-row-thumb sk-pulse" />
      <div className="sk-row-lines">
        <div className="sk-line sk-pulse" style={{ width: "60%" }} />
        <div className="sk-line sk-pulse" style={{ width: "35%" }} />
      </div>
    </div>
  );
}

export function SkeletonSegment() {
  return (
    <div className="sk-segment" aria-hidden="true">
      <div className="sk-seg-time sk-pulse" />
      <div className="sk-seg-lines">
        <div className="sk-line sk-pulse" style={{ width: "70%" }} />
        <div className="sk-line sk-pulse" style={{ width: "45%" }} />
      </div>
    </div>
  );
}
