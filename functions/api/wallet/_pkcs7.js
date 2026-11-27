// Detached CMS (PKCS#7) signature for a Wallet pass manifest, built on
// WebCrypto so it runs in a Pages Function: SHA-256 digest, RSA PKCS#1 v1.5,
// signed attributes contentType / signingTime / messageDigest, and the signer
// certificate plus its chain (Apple's WWDR intermediate) embedded.
// tools/wallet-pkcs7-test.mjs checks the output with `openssl cms -verify`.
import { cat, seq, octets, nul, ctx, int, oid, utcTime, setOf, set, tlv, read, children } from './_der.js';

const OID = {
  data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2',
  sha256: '2.16.840.1.101.3.4.2.1', rsa: '1.2.840.113549.1.1.1',
  contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
};

export function pemToDer(pem) {
  const b64 = String(pem || '').replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''); /* env vars often hold literal \n */
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Apple's Keychain export gives PKCS#8, `openssl pkcs12 -nodes` often gives
   PKCS#1 ("RSA PRIVATE KEY"); WebCrypto only takes PKCS#8, so wrap the latter. */
function pkcs8(keyPem) {
  const der = pemToDer(keyPem);
  if (!/BEGIN RSA PRIVATE KEY/.test(keyPem)) return der;
  return seq(int(0), seq(oid(OID.rsa), nul()), octets(der));
}

/* issuer Name and serialNumber INTEGER, as raw DER, from tbsCertificate. */
function issuerAndSerial(certDer) {
  const cert = read(certDer, 0);
  const tbs = children(certDer, cert)[0];
  const f = children(certDer, tbs);
  const i = f[0].tag === 0xA0 ? 1 : 0;          /* optional [0] version */
  return seq(f[i + 2].full, f[i].full);          /* fields: serial, sigAlg, issuer → issuer first */
}

export async function signDetached({ content, certPem, keyPem, chainPems = [], now = Date.now() }) {
  const certDer = pemToDer(certPem);
  const chain = chainPems.map(pemToDer);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
  const sha256 = seq(oid(OID.sha256), nul());
  const attrs = [
    seq(oid(OID.contentType), set(oid(OID.data))),
    seq(oid(OID.signingTime), set(utcTime(now))),
    seq(oid(OID.messageDigest), set(octets(digest))),
  ];
  /* The signature covers the attributes encoded as a SET (0x31); inside the
     SignerInfo the same bytes carry the [0] IMPLICIT tag (0xA0) instead. */
  const signedSet = setOf(attrs);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8(keyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, signedSet));
  const signedImplicit = cat(Uint8Array.of(0xA0), signedSet.subarray(1));
  const signerInfo = seq(int(1), issuerAndSerial(certDer), sha256, signedImplicit, seq(oid(OID.rsa), nul()), octets(sig));
  const signedData = seq(
    int(1),
    set(sha256),
    seq(oid(OID.data)),
    tlv(0xA0, certDer, ...chain),
    set(signerInfo),
  );
  return seq(oid(OID.signedData), ctx(0, signedData));
}
