# SRM Student Portal — residential proxy setup

SRM's F5 ASM rejects login requests coming from datacenter IP ranges. Local
residential IPs work; Vercel (even in Mumbai) gets the generic
**"Invalid Credentials"** page. To make the direct server-side login work from
Vercel, route the SRM requests through a **sticky residential proxy in India**.

## 1. Get a sticky residential proxy

Use a provider such as Bright Data, Oxylabs, Smartproxy, IPRoyal, or Webshare.
You need the **sticky session** endpoint, not the rotating one: the same exit IP
must be used for the login page, captcha, `LoginServlet`, attendance, and marks.
A 10-minute sticky session is enough.

Example URL shapes (check your provider dashboard for the exact format):

| Provider | Example `SP_PROXY_URL` |
| --- | --- |
| Bright Data | `http://brd-customer-<id>-zone-<zone>-session-<sid>:<pass>@brd.superproxy.io:33335` |
| Oxylabs | `http://user-<id>-session-<sid>:<pass>@pr.oxylabs.io:7777` |
| Smartproxy | `http://user-<id>-session-<sid>:<pass>@gate.smartproxy.com:7000` |
| IPRoyal | `http://user-session-<sid>:<pass>@geo.iproyal.com:12321` |

If the username or password contains special characters, URL-encode them
(`@` → `%40`, `#` → `%23`, etc.).

## 2. Set it in Vercel

Set the variable on the **backend project** (currently
`nexus-srm-academia-portal-ten`), not the frontend project:

1. Vercel Dashboard → `nexus-srm-academia-portal-ten`
2. **Settings → Environment Variables**
3. Add `SP_PROXY_URL` with the sticky proxy URL, scoped to **Production**
4. **Deployments → Redeploy**

## 3. Verify

```bash
curl -sS https://nexus-srm-academia-portal-ten.vercel.app/api/sp/proxy-status
# {"configured":true}
```

Then open the Attendance page and try **Connect Student Portal**.

## 4. Local testing

Put the URL in `server/.env` (gitignored) and restart the backend:

```env
SP_PROXY_URL=http://user-session-abc:pass@proxy.provider.com:8080
```

```bash
curl -sS http://localhost:3000/api/sp/proxy-status
# {"configured":true}
```

## Notes

- Supported schemes: `http://`, `https://`, `socks5://`.
- If the proxy rotates the exit IP between requests, SRM will still return
  `SECURITY_CHECK`; use a sticky session.
- HTTPS is tunneled through the proxy, so the password body is not readable by
  the proxy operator, but the proxy is still a third party. Use a reputable
  provider and rotate the SRM password after testing.
