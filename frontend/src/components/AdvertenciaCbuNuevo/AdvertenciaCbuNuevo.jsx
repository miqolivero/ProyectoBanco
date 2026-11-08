import { ShieldAlert } from 'lucide-react';
import './AdvertenciaCbuNuevo.css';

// Advertencia anti-estafa antes de transferir (o pagar un QR) a una cuenta a la que el usuario
// nunca le transfirió. La decide el backend: responde 409 con `requiereConfirmacion` y el texto
// del mensaje, sin mover plata. Si el usuario confirma, la pantalla reintenta con
// confirmar_cbu_nuevo: true. Lo comparten Transferencias y PagarCobro.
export default function AdvertenciaCbuNuevo({ mensaje, nombreDestino, procesando, alConfirmar, alCancelar }) {
  return (
    <div className="advertencia-overlay" onClick={procesando ? undefined : alCancelar}>
      <div className="advertencia-modal" role="alertdialog" aria-labelledby="advertencia-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="advertencia-icono"><ShieldAlert size={28} /></div>
        <h3 id="advertencia-titulo">Antes de continuar</h3>
        {nombreDestino && <p className="advertencia-destino">Destinatario: <strong>{nombreDestino}</strong></p>}
        <p className="advertencia-mensaje">{mensaje}</p>

        <div className="advertencia-acciones">
          <button type="button" className="btn-adv-cancelar" onClick={alCancelar} disabled={procesando}>
            No, cancelar
          </button>
          <button type="button" className="btn-adv-confirmar" onClick={alConfirmar} disabled={procesando}>
            {procesando ? 'Procesando...' : 'Sí, la conozco. Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
