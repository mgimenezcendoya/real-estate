// Railway Function: dispara el job de alertas diariamente
// Se ejecuta a las 8:00 AM UTC (5:00 AM Argentina)

export default async function handler(req, res) {
  const backendUrl = process.env.BACKEND_URL;
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  // Obtener token
  const loginRes = await fetch(`${backendUrl}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminUser, password: adminPass }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.text();
    console.error("Login failed:", err);
    return res.status(500).json({ error: "Login failed", detail: err });
  }

  const { token } = await loginRes.json();

  // Correr job de alertas
  const alertsRes = await fetch(`${backendUrl}/admin/jobs/alerts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const alertsData = await alertsRes.json();
  console.log("Alerts job result:", JSON.stringify(alertsData));

  return res.status(200).json(alertsData);
}
