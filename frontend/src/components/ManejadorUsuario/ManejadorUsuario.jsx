import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { TriangleAlert } from "lucide-react";
import FormularioOnboarding from "../FormularioOnboarding/FormularioOnboarding";
import InicioBanco from "../InicioBanco/InicioBanco";
import CompletarProvincia from "../CompletarProvincia/CompletarProvincia";
import "./ManejadorUsuario.css";
import { API_URL } from '../../config/api';

export default function ManejadorUsuario({ usuarioDemo = null }) {
  const { user: usuarioClerk } = useUser();
  // En la demo no hay usuario de Clerk: el "id" es el de la persona demo (ver config/demo.js).
  // useMemo para que la identidad sea estable y no dispare el efecto de carga en cada render.
  const user = useMemo(() => (usuarioDemo ? { id: usuarioDemo } : usuarioClerk), [usuarioDemo, usuarioClerk]);
  const [datosPersona, setDatosPersona] = useState(null);
  const [cargando, setCargando] = useState(true);
  // 🎯 Distingue "todavía no me registré" (404 real) de "no se pudo confirmar" (server caído,
  // red cortada, etc.) — antes ambos casos caían en el mismo catch y mandaban al formulario de
  // registro, lo cual asustaba a un usuario ya registrado si el backend estaba reiniciando.
  const [errorConexion, setErrorConexion] = useState(false);

  // 🔄 FUNCIÓN DE RECARGA GLOBAL: Trae los datos frescos de Postgres
  // Envuelta en useCallback (identidad estable mientras no cambie `user`) para que InicioBanco
  // pueda incluirla como dependencia de su efecto de heartbeat sin reiniciarlo en cada render.
  const cargarDatosUsuario = useCallback(async () => {
    if (!user) return;
    setErrorConexion(false);
    try {
      const res = await fetch(`${API_URL}/api/personas/verificar/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setDatosPersona(data);
      } else if (res.status === 404) {
        setDatosPersona(null);
      } else {
        throw new Error(`El servidor respondió con estado ${res.status}`);
      }
    } catch (err) {
      console.error("Error al verificar el usuario en Postgres:", err);
      setErrorConexion(true);
    } finally {
      setCargando(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      if (!cancelado) await cargarDatosUsuario();
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (cargando) {
    return (
      <div className="manejador-estado-container">
        <h3>Validando credenciales en Calamuchita Bank...</h3>
      </div>
    );
  }

  if (errorConexion) {
    return (
      <div className="manejador-estado-container">
        <TriangleAlert className="manejador-error-icon" size={32} />
        <h3>No pudimos confirmar tu cuenta</h3>
        <p className="manejador-error-texto">
          No se pudo conectar con el servidor de Calamuchita Bank. Puede ser que esté reiniciando
          o que se haya cortado la conexión — tu cuenta no se vio afectada.
        </p>
        <button className="btn-manejador-reintentar" onClick={cargarDatosUsuario} disabled={cargando}>
          Reintentar
        </button>
      </div>
    );
  }

  // Cuenta creada antes de que la provincia fuera obligatoria: la completa antes de entrar.
  if (datosPersona && !datosPersona.provincia) {
    return <CompletarProvincia datosUsuario={datosPersona} alCompletar={cargarDatosUsuario} />;
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
