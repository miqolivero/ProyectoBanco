import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import PantallaLogin from "./components/PantallaLogin/PantallaLogin";
import PantallaRegister from "./components/PantallaLogin/PantallaRegister";
import ManejadorUsuario from "./components/ManejadorUsuario/ManejadorUsuario";

export default function App() {
  const [esRegistro, setEsRegistro] = useState(window.location.hash.includes("sign-up"));

  useEffect(() => {
    const escucharCambioRuta = () => {
      setEsRegistro(window.location.hash.includes("sign-up"));
    };
    
    window.addEventListener("hashchange", escucharCambioRuta);
    return () => window.removeEventListener("hashchange", escucharCambioRuta);
  }, []);

  return (
    <>
      {/* 🔓 SI EL USUARIO NO ESTÁ LOGUEADO */}
      <SignedOut>
        {esRegistro ? <PantallaRegister /> : <PantallaLogin />}
      </SignedOut>

      {/* 🔐 SI EL USUARIO YA SE LOGUEÓ */}
      <SignedIn>
        <ManejadorUsuario />
      </SignedIn>
    </>
  );
}