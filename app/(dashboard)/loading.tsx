export default function HomeLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: "120px" }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: "300px" }} />
    </div>
  );
}
