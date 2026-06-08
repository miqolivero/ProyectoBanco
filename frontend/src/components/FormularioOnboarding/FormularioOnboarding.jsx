import React, { useState } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import logo from "../../assets/LogoMinimalista.png";
import fondoSierras from "../../assets/screen.png";
import './FormularioOnboarding.css'; // Importamos sus estilos independientes

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCargando(true);
    setErrorMsg('');

    const datosParaEnviar = {
      ...formData,
      email: user?.primaryEmailAddress?.emailAddress || '',
      clerkId: user?.id || ''
    };

    try {
      const response = await fetch('http://localhost:3001/api/personas', {
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
          <h1 className="onboarding-floating-title">Tu futuro financiero en armonía con el mundo.</h1>
          <p className="onboarding-floating-desc">
            Bienvenido a un banco que entiende la importancia de la estabilidad y la serenidad. Juntos, construiremos tu legado.
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

          {errorMsg && <div className="error-alert-banco">⚠️ {errorMsg}</div>}

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
                <input type="date" name="fecha_nacimiento" required value={formData.fecha_nacimiento} onChange={handleChange} />
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