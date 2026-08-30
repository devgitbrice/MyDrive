import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";

// Client bunq minimal en lecture seule. À chaque démarrage à froid, le
// serveur génère une paire de clés éphémère, enregistre une installation
// et un device (IP wildcard, requis sur Vercel), ouvre une session puis
// liste les paiements. Seule variable requise : BUNQ_API_KEY.
const BASE = "https://api.bunq.com/v1";

export interface BunqPayment {
  id: number;
  created: string;
  amount: { value: string; currency: string };
  counterparty_alias?: { display_name?: string; iban?: string };
  description?: string;
  type?: string;
  sub_type?: string;
  monetary_account_id: number;
}

interface BunqContext {
  sessionToken: string;
  userId: number;
  sign: (body: string) => string;
}

let ctx: BunqContext | null = null;

type BunqObject = Record<string, Record<string, unknown> & { id?: number; token?: string }>;

function flat(response: { Response: BunqObject[] }): BunqObject {
  return Object.assign({}, ...response.Response);
}

async function call(path: string, opts: { method?: string; body?: string; auth?: string; signature?: string }) {
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    body: opts.body,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "User-Agent": "MyDrive-Finances/1.0",
      "X-Bunq-Client-Request-Id": randomUUID(),
      "X-Bunq-Language": "fr_FR",
      "X-Bunq-Region": "fr_FR",
      "X-Bunq-Geolocation": "0 0 0 0 000",
      ...(opts.auth ? { "X-Bunq-Client-Authentication": opts.auth } : {}),
      ...(opts.signature ? { "X-Bunq-Client-Signature": opts.signature } : {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`bunq ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function openSession(): Promise<BunqContext> {
  const apiKey = process.env.BUNQ_API_KEY;
  if (!apiKey) throw new Error("BUNQ_API_KEY manquant");

  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sign = (body: string) => {
    const s = createSign("RSA-SHA256");
    s.update(body);
    return s.sign(privateKey, "base64");
  };

  const inst = flat(await call("/installation", {
    method: "POST",
    body: JSON.stringify({ client_public_key: publicKey.export({ type: "spki", format: "pem" }).toString() }),
  }));
  const instToken = inst.Token.token as string;

  const devBody = JSON.stringify({ description: "MyDrive Finances (Vercel)", secret: apiKey, permitted_ips: ["*"] });
  await call("/device-server", { method: "POST", body: devBody, auth: instToken, signature: sign(devBody) });

  const sessBody = JSON.stringify({ secret: apiKey });
  const sess = flat(await call("/session-server", { method: "POST", body: sessBody, auth: instToken, signature: sign(sessBody) }));
  const apiKeyUser = (sess.UserApiKey as { granted_by_user?: { UserPerson?: { id: number } } } | undefined)?.granted_by_user?.UserPerson;
  const user = (sess.UserPerson || apiKeyUser || sess.UserCompany) as { id: number };
  return { sessionToken: sess.Token.token as string, userId: user.id, sign };
}

async function getContext(): Promise<BunqContext> {
  if (ctx) return ctx;
  ctx = await openSession();
  return ctx;
}

// Liste tous les paiements de tous les comptes (pagination older_id),
// et remonte le solde total des comptes.
export async function fetchBunqPayments(): Promise<{ payments: BunqPayment[]; balance: number }> {
  let c = await getContext();
  const get = async (path: string) => {
    try {
      return await call(path, { auth: c.sessionToken });
    } catch (e) {
      // Session expirée : on en rouvre une puis on rejoue l'appel.
      if (String(e).includes("Insufficient authorisation") || String(e).includes("401")) {
        ctx = null;
        c = await getContext();
        return await call(path, { auth: c.sessionToken });
      }
      throw e;
    }
  };

  const accountsRes = await get(`/user/${c.userId}/monetary-account?count=25`);
  const accountObjs = (accountsRes.Response as BunqObject[])
    .map((entry) => Object.values(entry)[0])
    .filter((a): a is BunqObject[string] => Boolean(a && a.id));
  const accountIds: number[] = accountObjs.map((a) => a.id as number);
  const balance = accountObjs.reduce((s, a) => {
    const b = (a as { balance?: { value?: string } }).balance;
    return s + (parseFloat(b?.value || "0") || 0);
  }, 0);

  const all: BunqPayment[] = [];
  for (const accId of accountIds) {
    let path = `/user/${c.userId}/monetary-account/${accId}/payment?count=200`;
    for (;;) {
      const page = await get(path);
      const items = (page.Response as { Payment: BunqPayment }[]).map((p) => p.Payment).filter(Boolean);
      all.push(...items);
      const older = page.Pagination?.older_url as string | null;
      if (!older || items.length === 0) break;
      path = older.replace("/v1", "");
    }
  }
  return { payments: all, balance };
}
