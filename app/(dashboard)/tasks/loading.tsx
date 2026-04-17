export default function TasksLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: "100px" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: "36px", width: "100px" }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: "480px" }} />
    </div>
  );
}
