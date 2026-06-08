import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import FormularioOnboarding from "../FormularioOnboarding/FormularioOnboarding";
import InicioBanco from "../InicioBanco/InicioBanco";

export default function ManejadorUsuario() {
  const { user } = useUser();
  const [datosPersona, setDatosPersona] = useState(null);
  const [cargando, setCargando] = useState(true);

  // 🔄 FUNCIÓN DE RECARGA GLOBAL: Trae los datos frescos de Postgres
  const cargarDatosUsuario = async () => {
    if (!user) return;
    try {
      const res = await fetch(`http://localhost:3001/api/personas/verificar/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setDatosPersona(data);
      } else if (res.status === 404) {
        setDatosPersona(null);
      } else {
        throw new Error("Error en la respuesta del servidor");
      }
    } catch (err) {
      console.error("Error al verificar el usuario en Postgres:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (user) {
      setCargando(true);
      cargarDatosUsuario();
    }
  }, [user]);

  if (cargando) {
    return (
      <div style={{ 
        display: 'flex', 
        height: '100vh', 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#ffffff', 
        fontFamily: "'Segoe UI', sans-serif" 
      }}>
        <h3 style={{ color: '#1a3d2b', fontWeight: '600' }}>
          Validando credenciales en Calamuchita Bank...
        </h3>
      </div>
    );
  }

  if (datosPersona) {
    // 🚨 LE PASAMOS LA FUNCIÓN DE RECARGA AL INICIO DEL BANCO
    return <InicioBanco datosUsuario={datosPersona} actualizarDatosBase={cargarDatosUsuario} />;
  }

  return (
    <FormularioOnboarding 
      onRegistroExitoso={(nuevosDatos) => setDatosPersona(nuevosDatos)} 
    />
  );
}