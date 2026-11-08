import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, User, Save } from 'lucide-react';
import './Ajustes.css';
import { API_URL } from '../../config/api';
import { obtenerProvincias } from '../../config/provincias';

export default function Ajustes({ datosUsuario, alActualizarExitoso, alCancelar }) {
  const [email, setEmail] = useState(datosUsuario?.email || '');
  const [telefono, setTelefono] = useState(datosUsuario?.telefono || '');
  const [direccion, setDireccion] = useState(datosUsuario?.direccion || '');
  const [provincia, setProvincia] = useState(datosUsuario?.provincia || '');
  const [provincias, setProvincias] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  useEffect(() => {
    let cancelado = false;
    obtenerProvincias()
      .then(lista => { if (!cancelado) setProvincias(lista); })
      .catch(err => { if (!cancelado) setMensaje({ tipo: 'error', texto: err.message }); });
    return () => { cancelado = true; };
  }, []);

  const formatearFecha = (stringFecha) => {
    if (!stringFecha) return '---';
    const fecha = new Date(stringFecha);
    if (isNaN(fecha.getTime())) return '---';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje({ tipo: '', texto: '' });

    try {
      setGuardando(true);
      const response = await fetch(`${API_URL}/api/personas/${datosUsuario.id}/perfil`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), telefono: telefono.trim(), direccion: direccion.trim(), provincia })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');

      setMensaje({ tipo: 'exito', texto: 'Tus datos se actualizaron correctamente.' });
      if (alActualizarExitoso) await alActualizarExitoso();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="ajustes-container">
      <div className="ajustes-header-box">
        <span className="ajustes-eyebrow">Tu perfil, tan tuyo como el paisaje que elegiste</span>
        <h2>Ajustes de Perfil</h2>
        <p>Actualizá tus datos de contacto. El nombre, DNI y CBU no se pueden cambiar acá porque están registrados en la red del Banco Central (el alias sí se puede editar, desde la pantalla de Inicio).</p>
      </div>

      <div className="ajustes-layout">
        <div className="ajustes-card">
          <form onSubmit={handleSubmit} className="ajustes-form">
            <div className="ajustes-field">
              <label>Email</label>
              <input
                type="email"
                className="ajustes-input-text"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={guardando}
                required
              />
            </div>

            <div className="ajustes-field">
              <label>Teléfono</label>
              <input
                type="text"
                className="ajustes-input-text"
                placeholder="3534123456"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={guardando}
              />
            </div>

            <div className="ajustes-field">
              <label>Dirección</label>
              <input
                type="text"
                className="ajustes-input-text"
                placeholder="Av. San Martín 450"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                disabled={guardando}
              />
            </div>

            <div className="ajustes-field">
              <label>Provincia</label>
              <select
                className="ajustes-input-text"
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                disabled={guardando || provincias.length === 0}
                required
              >
                <option value="" disabled>Elegí tu provincia</option>
                {provincias.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {mensaje.texto && (
              <div className={`ajustes-alert ${mensaje.tipo}`}>
                {mensaje.tipo === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {mensaje.texto}
              </div>
            )}

            <div className="ajustes-actions">
              <button type="button" onClick={alCancelar} disabled={guardando} className="btn-aj-cancelar">
                Volver al Inicio
              </button>
              <button type="submit" disabled={guardando} className="btn-aj-guardar">
                <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>

        <div className="ajustes-info-panel">
          <h4><User size={16} /> Datos registrados</h4>
          <span className="ajustes-info-label">Nombre completo</span>
          <p className="ajustes-info-dato">{datosUsuario?.nombre} {datosUsuario?.apellido}</p>
          <span className="ajustes-info-label">DNI</span>
          <p className="ajustes-info-dato">{datosUsuario?.dni || '---'}</p>
          <span className="ajustes-info-label">Fecha de nacimiento</span>
          <p className="ajustes-info-dato">{formatearFecha(datosUsuario?.fecha_nac)}</p>
          <span className="ajustes-info-label">CBU</span>
          <p className="ajustes-info-dato mono-text">{datosUsuario?.cbu}</p>
          <span className="ajustes-info-label">Alias</span>
          <p className="ajustes-info-dato">{datosUsuario?.alias || 'sin.alias.registrado'}</p>
        </div>
      </div>
    </div>
  );
}
