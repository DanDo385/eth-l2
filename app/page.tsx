export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Rollup Mechanics Lab</h1>
      <p>
        Run the backend pipeline with <code>make start</code>,{" "}
        <code>make deploy</code>, <code>make op</code>, then{" "}
        <code>make analyze</code> and <code>make artifacts</code>. Report data
        will appear in <code>public/report.json</code>.
      </p>
    </main>
  );
}
