export default function Home() {
  return (
    <pre style={{ padding: 24 }}>
      {process.env.DATABASE_URL ? "ENV OK ✅" : "ENV NÃO CARREGOU ❌"}
    </pre>
  );
}
