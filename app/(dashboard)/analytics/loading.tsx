export default function AnalyticsLoading() {
  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: "100px" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="skeleton" style={{ height: "260px" }} />
        <div className="skeleton" style={{ height: "260px" }} />
      </div>
      <div className="skeleton" style={{ height: "260px" }} />
    </div>
  );
}
