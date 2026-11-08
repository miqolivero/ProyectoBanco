import { useState, useEffect } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { AlertTriangle, MapPin } from 'lucide-react';
import logo from "../../assets/LogoMinimalista.png";
import './CompletarProvincia.css';
import { API_URL } from '../../config/api';
import { obtenerProvincias } from '../../config/provincias';

// 🎯 Las cuentas creadas antes de que la provincia fuera obligatoria pasan por acá en el
// próximo ingreso, antes de llegar al dashboard (ver ManejadorUsuario). La provincia se elige
// de la lista de las 24 jurisdicciones, nunca como texto libre.
export default function CompletarProvincia({ datosUsuario, alCompletar }) {
  const { signOut } = useClerk();
  const [provincias, setProvincias] = useState([]);
  const [provincia, setProvincia] = useState('');
  const [direccion, setDireccion] = useState(datosUsuario?.direccion || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    obtenerProvincias()
      .then(lista => { if (!cancelado) setProvincias(lista); })
      .catch(err => { if (!cancelado) setError(err.message); });
    return () => { cancelado = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setGuardando(true);
      const res = await fetch(`${API_URL}/api/personas/${datosUsuario.id}/domicilio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provincia, direccion: direccion.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar tu provincia.');
      if (alCompletar) await alCompletar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="completar-container">
      <form className="completar-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Calamuchita Bank" className="completar-logo" />
        <div className="completar-icono"><MapPin size={22} /></div>
        <h2>Completá tu domicilio</h2>
        <p>
          Hola {datosUsuario?.nombre}, para seguir necesitamos saber en qué provincia vivís.
          Lo vas a poder actualizar cuando quieras desde Ajustes.
        </p>

        <label className="completar-label">Provincia</label>
        <select
          className="completar-input"
          value={provincia}
          onChange={(e) => setProvincia(e.target.value)}
          disabled={guardando || provincias.length === 0}
          required
        >
          <option value="" disabled>Elegí tu provincia</option>
          {provincias.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <label className="completar-label">Dirección</label>
        <input
          type="text"
          className="completar-input"
          placeholder="Av. San Martín 450"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          disabled={guardando}
        />

        {error && <div className="completar-alert"><AlertTriangle size={16} /> {error}</div>}

        <button type="submit" className="btn-completar" disabled={guardando || !provincia}>
          {guardando ? 'Guardando...' : 'Continuar'}
        </button>
        <button type="button" className="btn-completar-salir" onClick={() => signOut()} disabled={guardando}>
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
