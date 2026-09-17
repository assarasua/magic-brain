import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return <LegalPage title={{ en: "Terms of Service", es: "Términos del servicio" }} intro={{ en: "The rules for using Magic Brain and its developer services.", es: "Las reglas para utilizar Magic Brain y sus servicios para desarrolladores." }} sections={{
    en: [
      { title: "The service", body: <p>Magic Brain helps users organize Magic: The Gathering cards and view market-derived information. It is an unofficial product, is not affiliated with Wizards of the Coast, and does not provide financial advice or guarantee prices, availability or outcomes.</p> },
      { title: "Your account", body: <p>You must provide accurate information, keep access secure, and use only accounts and data you are authorized to use. You are responsible for activity through your API keys and connected OAuth clients.</p> },
      { title: "Acceptable use", body: <p>Do not disrupt the service, evade limits, scrape abusively, infringe rights, upload unlawful material, or use APIs, MCP or WebMCP to access another person’s data without permission. We may restrict abusive or unsafe access.</p> },
      { title: "Content and third parties", body: <p>You retain rights in your notes and collection data. Card names, art and trademarks belong to their respective owners. Third-party services and outbound marketplaces are governed by their own terms.</p> },
      { title: "Availability and liability", body: <p>The service is provided on a reasonable-efforts basis and may change or be interrupted. To the extent allowed by law, BizkardoLab is not liable for indirect losses or decisions based on market information. Mandatory consumer rights are unaffected.</p> },
      { title: "Ending use", body: <p>You may delete your account at any time in Settings. We may suspend access for material breach, security risk or legal requirements. Spanish law applies, without removing mandatory protections available in your country of residence.</p> },
    ],
    es: [
      { title: "El servicio", body: <p>Magic Brain ayuda a organizar cartas de Magic: The Gathering y consultar información derivada del mercado. Es un producto no oficial, no está afiliado con Wizards of the Coast y no ofrece asesoramiento financiero ni garantiza precios, disponibilidad o resultados.</p> },
      { title: "Tu cuenta", body: <p>Debes aportar información correcta, proteger el acceso y utilizar solo cuentas y datos para los que tengas autorización. Eres responsable de la actividad de tus claves API y clientes OAuth conectados.</p> },
      { title: "Uso aceptable", body: <p>No interrumpas el servicio, eludas límites, hagas extracción abusiva, infrinjas derechos, subas material ilícito ni uses API, MCP o WebMCP para acceder sin permiso a datos ajenos. Podemos limitar accesos abusivos o inseguros.</p> },
      { title: "Contenido y terceros", body: <p>Conservas los derechos sobre tus notas y datos de colección. Los nombres, ilustraciones y marcas pertenecen a sus respectivos titulares. Los servicios y mercados externos tienen sus propias condiciones.</p> },
      { title: "Disponibilidad y responsabilidad", body: <p>El servicio se presta con esfuerzos razonables y puede cambiar o interrumpirse. En la medida permitida por ley, BizkardoLab no responde de pérdidas indirectas ni de decisiones basadas en información de mercado. Se mantienen intactos los derechos imperativos de consumidores.</p> },
      { title: "Finalización", body: <p>Puedes borrar la cuenta en Ajustes. Podemos suspender el acceso por incumplimiento esencial, riesgo de seguridad u obligación legal. Se aplica la ley española sin excluir las protecciones imperativas de tu país de residencia.</p> },
    ],
  }} />;
}
