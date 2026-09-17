import { LegalPage } from "@/components/legal-page";

export default function CookiesPage() {
  return <LegalPage title={{ en: "Cookie Policy", es: "Política de cookies" }} intro={{ en: "A clear inventory of cookies and browser storage used by Magic Brain.", es: "Inventario claro de las cookies y almacenamiento del navegador utilizados por Magic Brain." }} sections={{
    en: [
      { title: "Necessary cookies", body: <ul><li><strong>Auth.js session, CSRF and callback cookies:</strong> secure sign-in and fraud protection; session duration or short-lived.</li><li><strong>magic_brain_session:</strong> links authenticated product data securely; up to 12 months, HttpOnly, Secure and SameSite=Lax.</li></ul> },
      { title: "Optional cookie", body: <p><strong>magic_brain_referral</strong> remembers who referred you for up to 30 days. It is created only after you allow referral attribution in the cookie banner.</p> },
      { title: "Local browser storage", body: <p><strong>magic-brain-locale</strong> remembers language; <strong>magic-brain-product-tour-v3</strong> remembers that the tour was completed; and <strong>magic-brain-cookie-consent-v1</strong> records your cookie choice. These are functional settings. A pending referral may be kept temporarily in session storage until you choose.</p> },
      { title: "Your choice", body: <p>Magic Brain currently uses no advertising or analytics cookies. You can reject the optional referral cookie without losing core functionality. Clear this site’s cookies and local storage in your browser to reset your choice.</p> },
    ],
    es: [
      { title: "Cookies necesarias", body: <ul><li><strong>Cookies de sesión, CSRF y retorno de Auth.js:</strong> acceso seguro y protección contra fraude; duración de sesión o corta.</li><li><strong>magic_brain_session:</strong> vincula los datos del producto de forma segura; hasta 12 meses, HttpOnly, Secure y SameSite=Lax.</li></ul> },
      { title: "Cookie opcional", body: <p><strong>magic_brain_referral</strong> recuerda quién te invitó durante un máximo de 30 días. Solo se crea tras permitir la atribución de referidos en el banner.</p> },
      { title: "Almacenamiento local", body: <p><strong>magic-brain-locale</strong> recuerda el idioma; <strong>magic-brain-product-tour-v3</strong> recuerda el tour; y <strong>magic-brain-cookie-consent-v1</strong> guarda tu elección. Son ajustes funcionales. Un referido pendiente puede guardarse temporalmente en la sesión hasta que elijas.</p> },
      { title: "Tu elección", body: <p>Magic Brain no usa actualmente cookies publicitarias ni analíticas. Puedes rechazar la cookie opcional sin perder funciones esenciales. Borra las cookies y almacenamiento local del sitio en tu navegador para restablecer tu elección.</p> },
    ],
  }} />;
}
