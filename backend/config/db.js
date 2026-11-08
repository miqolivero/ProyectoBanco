const { Pool } = require('pg');
require('dotenv').config();

// 🎯 Supabase (y cualquier Postgres gestionado) SOLO acepta conexiones por SSL; el Postgres
// local de desarrollo normalmente no tiene SSL configurado y falla si se lo exige. En vez de
// agregar otra variable de entorno para distinguir, se deduce del host de la cadena de conexión:
// localhost/127.0.0.1 = desarrollo (SSL apagado), cualquier otro host = base gestionada (SSL on).
// Así el mismo código funciona en local y en producción sin tocar nada.
const esBaseLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

// rejectUnauthorized: false porque el certificado de Supabase está firmado por su propia CA, que
// no viene en el trust store de Node — sin esto la conexión falla con "self signed certificate in
// certificate chain". El tráfico viaja cifrado igual; lo que no se valida es la cadena del
// certificado (es decir, no protege contra un man-in-the-middle que intercepte la conexión).
// Para endurecerlo habría que descargar el certificado de la CA de Supabase (Dashboard →
// Settings → Database → SSL Configuration) y pasarlo acá como `ca`.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: esBaseLocal ? false : { rejectUnauthorized: false },
});

// 🎯 Cuenta demo: si la request actual pertenece a una sesión de demo, la consulta va a la
// conexión de esa sesión (una transacción que nunca se confirma) en vez de al pool. Así ningún
// modelo necesita saber que existe la demo. Ver config/sandboxDemo.js.
// `conectarReal` queda expuesto para que la demo pueda pedir su propia conexión al pool.
const { mundoActual } = require('./sandboxDemo');
const queryReal = pool.query.bind(pool);
const conectarReal = pool.connect.bind(pool);
pool.query = (...args) => {
  const mundo = mundoActual();
  return mundo ? mundo.query(...args) : queryReal(...args);
};
pool.connect = (...args) => {
  const mundo = mundoActual();
  return mundo ? Promise.resolve(mundo.conectar()) : conectarReal(...args);
};
pool.conectarReal = conectarReal;

module.exports = pool;
