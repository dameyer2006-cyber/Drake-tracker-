export default async function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: "No code provided" });
  }

  try {
    const response = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "525fe22b-c12a-4992-b3b5-b7b6e57572d9",
        client_secret: "1ac1598af3c12cc235c66d986252e6659d582339b22407937b3f1fabb9e88969",
        redirect_uri: "https://drake-tracker.vercel.app/callback",
      })
    });

    const data = await response.json();
    
    if (data.access_token) {
      res.redirect(`/?token=${data.access_token}&refresh=${data.refresh_token}`);
    } else {
      res.redirect("/?error=auth_failed");
    }
  } catch {
    res.redirect("/?error=server_error");
  }
}
