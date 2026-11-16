function Integritetspolicy() {
  return (
    <div className="page-container account">
      <h1>Integritetspolicy</h1>
      <p>KLEOS är en webbshop byggd som skoluppgift. Här beskriver vi vilka uppgifter vi sparar och varför.</p>

      <h2>Inloggning med Google</h2>
      <p>
        När du loggar in med Google får vi bara ditt namn, din e-postadress och ett id från Google
        (scope <code>openid email profile</code>). Vi sparar dem för att känna igen dig och visa dina
        beställningar under Mina sidor. Vi får aldrig ditt lösenord och sparar inga tokens från Google.
      </p>

      <h2>Beställningar</h2>
      <p>
        För att leverera din order sparar vi namn, e-post, telefon, adress och vad du har köpt.
        Betalningen sköts av Stripe – kortuppgifter når aldrig vår server. Frakten bokas via PostNord.
      </p>

      <h2>Cookies</h2>
      <p>
        Vi använder en cookie, <code>session</code>, som håller dig inloggad. Den kan inte läsas av
        JavaScript och går ut efter några timmar. Varukorgen sparas i din webbläsare.
      </p>

      <h2>Dina rättigheter</h2>
      <p>Vill du att vi tar bort dina uppgifter? Kontakta oss så raderar vi ditt konto och dina ordrar.</p>
    </div>
  );
}

export default Integritetspolicy;