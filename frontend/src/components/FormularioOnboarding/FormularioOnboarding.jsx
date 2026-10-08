import { useState } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { TriangleAlert } from 'lucide-react';
import logo from "../../assets/LogoMinimalista.png";
import fondoSierras from "../../assets/screen.png";
import './FormularioOnboarding.css'; // Importamos sus estilos independientes
import { API_URL } from '../../config/api';

const FormularioOnboarding = ({ onRegistroExitoso }) => {
  const { user } = useUser();
  const { signOut } = useClerk();

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    fecha_nacimiento: '',
    telefono: '',
    direccion: '',
    alias: ''
  });

  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Mismo mínimo que valida el backend (personaController.js) — se repite acá solo para dar
  // feedback inmediato sin ida y vuelta al servidor; la validación real y autoritativa es la del
  // backend, esta es puramente de UX.
  const EDAD_MINIMA = 18;
  // Tope del datepicker: hoy - 18 años, para que ni siquiera se pueda elegir una fecha de un
  // menor desde el calendario (además de la validación al enviar el formulario).
  const fechaMaximaNacimiento = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - EDAD_MINIMA);
    return d.toISOString().slice(0, 10);
  })();
  const calcularEdad = (fechaNacimiento) => {
    const nacimiento = new Date(fechaNacimiento);
    if (isNaN(nacimiento.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const noCumplioAunEsteAnio =
      hoy.getMonth() < nacimiento.getMonth() ||
      (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
    if (noCumplioAunEsteAnio) edad--;
    return edad;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const edad = calcularEdad(formData.fecha_nacimiento);
    if (edad === null) {
      setErrorMsg('Ingresá una fecha de nacimiento válida.');
      return;
    }
    if (edad < EDAD_MINIMA) {
      setErrorMsg(`Debés ser mayor de ${EDAD_MINIMA} años para abrir una cuenta en Calamuchita Bank.`);
      return;
    }

    setCargando(true);

    const datosParaEnviar = {
      ...formData,
      email: user?.primaryEmailAddress?.emailAddress || '',
      clerkId: user?.id || ''
    };

    try {
      const response = await fetch(`${API_URL}/api/personas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(datosParaEnviar)
      });

      const data = await response.json();

      if (response.ok) {
        // 🚨 MODIFICACIÓN: Armamos el objeto con la estructura que necesita InicioBanco
        const datosCompletosUsuario = {
          nombre: formData.nombre,
          apellido: formData.apellido,
          dni: formData.dni,
          direccion: formData.direccion,
          email: datosParaEnviar.email,
          telefono: formData.telefono,
          fecha_nac_date: formData.fecha_nacimiento,
          clerk_id: datosParaEnviar.clerkId,
          cbu: data.cbu,         // Capturamos el CBU real que devolvió tu backend
          alias: formData.alias, // El alias elegido
          saldo: 0               // Cuenta corriente nueva arranca con saldo inicial 0
        };

        // Pasamos los datos estructurados al componente padre para forzar la redirección automática
        if (onRegistroExitoso) {
          onRegistroExitoso(datosCompletosUsuario);
        }
      } else {
        setErrorMsg(data.error || 'Error al procesar el registro local.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="onboarding-container">
      
      {/* SECCIÓN IZQUIERDA: IMAGEN CON FILTRO VERDE */}
      <div className="onboarding-left-img-col">
        <img src={fondoSierras} alt="Calamuchita" className="onboarding-bg-image" />
        <div className="onboarding-floating-text">
          <h1 className="onboarding-floating-title">Comienza tu viaje hacia la serenidad financiera.</h1>
          <p className="onboarding-floating-desc">
           Únete a la comunidad que valora la estabilidad del bosque y la transparencia del agua. Tu futuro, arraigado en la confianza.
          </p>
        </div>
      </div>

      {/* SECCIÓN DERECHA: FORMULARIO AMPLIO */}
      <div className="onboarding-right-form-col">
        
        {/* LOGO Y PROGRESO */}
        <div className="onboarding-header-form">
          <img src={logo} alt="Calamuchita BANK" className="login-logo-img" />
          <div className="progreso-box">
            <span className="progreso-txt">PROGRESO</span>
            <span className="paso-txt">Paso 2 de 2</span>
            <div className="linea-progreso"></div>
          </div>
        </div>

        {/* CONTENIDO DEL FORMULARIO */}
        <div className="onboarding-title-box">
          <h2>Completa tu perfil</h2>
          <p>Necesitamos unos datos adicionales para finalizar tu registro bancario.</p>

          {errorMsg && <div className="error-alert-banco"><TriangleAlert size={16} /> {errorMsg}</div>}

          <form onSubmit={handleSubmit} className="form-banco">
            
            {/* Fila Doble: Nombre y Apellido */}
            <div className="form-row">
              <div className="input-group">
                <label>Nombre</label>
                <input type="text" name="nombre" required placeholder="Ej. Juan Ignacio" value={formData.nombre} onChange={handleChange} />
              </div>
              <div className="input-group">
                <label>Apellido</label>
                <input type="text" name="apellido" required placeholder="Ej. Pérez" value={formData.apellido} onChange={handleChange} />
              </div>
            </div>

            {/* DNI */}
            <div className="input-group">
              <label>DNI / Documento</label>
              <input type="text" name="dni" required placeholder="00000000 (sin puntos)" value={formData.dni} onChange={handleChange} />
            </div>

            {/* Fila Doble: Nacimiento y Teléfono */}
            <div className="form-row">
              <div className="input-group">
                <label>Fecha de Nacimiento</label>
                <input
                  type="date"
                  name="fecha_nacimiento"
                  required
                  max={fechaMaximaNacimiento}
                  value={formData.fecha_nacimiento}
                  onChange={handleChange}
                />
              </div>
              <div className="input-group">
                <label>Teléfono</label>
                <input type="text" name="telefono" placeholder="3534123456" value={formData.telefono} onChange={handleChange} />
              </div>
            </div>

            {/* Dirección */}
            <div className="input-group">
              <label>Dirección Residencial</label>
              <input type="text" name="direccion" placeholder="Av. San Martín 450" value={formData.direccion} onChange={handleChange} />
            </div>

            {/* Alias */}
            <div className="input-group">
              <label>Elegí tu Alias Bancario</label>
              <input type="text" name="alias" required placeholder="ejemplo.cba.calamuchita" value={formData.alias} onChange={handleChange} />
            </div>

            {/* Botón de envío */}
            <button type="submit" disabled={cargando} className="btn-submit-banco">
              {cargando ? 'Validando con BCRA...' : 'Finalizar Registro →'}
            </button>
          </form>

          {/* Botón para desloguear de Clerk y volver atrás */}
          <button onClick={() => signOut()} className="btn-signout-onboarding">
            Volver al paso anterior (Cerrar Sesión)
          </button>
        </div>

      </div>
    </div>
  );
};

export default FormularioOnboarding;