export default function ActivityLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", gap: "12px" }}>
        <div className="skeleton" style={{ height: "36px", width: "180px" }} />
        <div className="skeleton" style={{ height: "36px", width: "180px" }} />
      </div>
      <div className="skeleton" style={{ height: "480px" }} />
    </div>
  );
}
