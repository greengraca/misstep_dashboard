export default function EvLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="skeleton" style={{ height: "48px", maxWidth: "400px" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="skeleton" style={{ height: "140px" }} />
        ))}
      </div>
    </div>
  );
}
