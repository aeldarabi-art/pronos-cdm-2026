export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed"
    });
  }

  const { code } = req.body || {};

  if (!code) {
    return res.status(400).json({
      ok: false,
      message: "Code manquant"
    });
  }

  if (code === process.env.ADMIN_CODE) {
    return res.status(200).json({
      ok: true
    });
  }

  return res.status(401).json({
    ok: false,
    message: "Code admin incorrect"
  });
}
