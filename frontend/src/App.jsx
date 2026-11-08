import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import PantallaLogin from "./components/PantallaLogin/PantallaLogin";
import PantallaRegister from "./components/PantallaLogin/PantallaRegister";
import ManejadorUsuario from "./components/ManejadorUsuario/ManejadorUsuario";
import CobroPublico from "./components/CobroPublico/CobroPublico";
import { leerCobroPendiente } from "./config/linkCobro";
import { leerDemo } from "./config/demo";

export default function App() {
  const [esRegistro, setEsRegistro] = useState(window.location.hash.includes("sign-up"));
  // Si se entró por el link de un cobro sin sesión, primero se muestra el cobro (no el login
  // pelado). Al elegir "Abrir mi cuenta" o "Iniciar sesión" se pasa a Clerk; el id del cobro
  // sigue guardado y, ya adentro, InicioBanco abre directo la pantalla de pago.
  const [cobroSinSesion, setCobroSinSesion] = useState(() => leerCobroPendiente());
  // 🎯 Cuenta demo: si hay una sesión de demo abierta en esta pestaña, se entra directo con la
  // persona demo, sin pasar por Clerk (ver config/demo.js).
  const [demo] = useState(() => leerDemo());

  useEffect(() => {
    const escucharCambioRuta = () => {
      setEsRegistro(window.location.hash.includes("sign-up"));
    };

    window.addEventListener("hashchange", escucharCambioRuta);
    return () => window.removeEventListener("hashchange", escucharCambioRuta);
  }, []);

  const irAClerk = (hash) => {
    setCobroSinSesion(null);
    window.location.hash = hash;
  };

  if (demo) return <ManejadorUsuario usuarioDemo={demo.usuario} />;

  return (
    <>
      {/* 🔓 SI EL USUARIO NO ESTÁ LOGUEADO */}
      <SignedOut>
        {cobroSinSesion ? (
          <CobroPublico
            idCobro={cobroSinSesion}
            alRegistrarse={() => irAClerk("sign-up")}
            alIniciarSesion={() => irAClerk("sign-in")}
          />
        ) : esRegistro ? <PantallaRegister /> : <PantallaLogin />}
      </SignedOut>

      {/* 🔐 SI EL USUARIO YA SE LOGUEÓ */}
      <SignedIn>
        <ManejadorUsuario />
      </SignedIn>
    </>
  );
}
