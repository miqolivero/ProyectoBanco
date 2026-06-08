# 🏦 Sistema de Homebanking - Calamuchita Bank

Este proyecto consiste en una plataforma digital de homebanking diseñada para un banco pequeño. Permite a los clientes gestionar sus cuentas, realizar transferencias en tiempo real y registrar depósitos. El sistema está construido con una arquitectura desacoplada que separa el Frontend (React) del Backend (Node.js/Express) y utiliza una base de datos relacional (PostgreSQL).

---

## 🏗️ Arquitectura del Backend (MVC)

El servidor está estructurado bajo el patrón de diseño donde se dividen las responsabilidades de la siguiente manera:
* *Routes: Definen los caminos (endpoints) por los cuales el Frontend se comunica con el servidor.
* Controllers: Contienen la lógica de negocio, validaciones de datos entrantes y la coordinación con APIs externas.
* Models: Manejan exclusivamente la conexión con PostgreSQL mediante `pg.Pool`, ejecutando consultas SQL y transacciones seguras (`BEGIN/COMMIT/ROLLBACK`).

---

## ⏳ Cronología de Desarrollo y Evolución del Proyecto

A lo largo de las semanas, el proyecto avanzó incorporando funcionalidades de forma incremental, resolviendo las necesidades del negocio:

### 🔹 Fase 1: Estructura Base.
* Se montó el servidor inicial con Express y se vinculó la base de datos local, PostgreSQL utilizamos para alamcenar los datos.
* Utilizamos el repositorio que nos dejo el profe en GitHub como base del proyecto, donde habia un DER, una estructura de base de datos que fuimos modificando para cubrir las necesidades.

### 🔹 Fase 2: Consultas Locales e Historial
* Se crearon las tablas de `Cuentas_Bancarias` y `movimientos` en PostgreSQL.
* Se implementaron los primeros endpoints de lectura en el controlador:
  * `GET /api/movimientos/historial` (Usa el modelo `Movimiento.obtenerTodos(cbu)`).
* *Desafío Resuelto:* Corregimos las propiedades del mapeo en el frontend para sincronizar la columna real de la base de datos (`fecha_movimiento`), logrando que el historial impacte prolijamente en la grilla visual.

### 🔹 Fase 3: Integración con la Red Central (API Externa)
* **El gran salto:** Conectamos nuestro banco local con el ecosistema del *Central Bank* del profesor.
* *Un gran desafio: enviar datos del registro de una nueva persona al Central Bank y recibir el cbu que le era asignado como respuesta de manera simultanea.
    En el personaController manejamos esto, enviado el POST a la API central y guardando la informacion de registro mediante el modelPersona.
*EL HITO: * Nos comunicamos con el mundo externo. Con la API del centra empezamos a poder hacer y recibir transferencias de los demas bancos.
    Le enviamos al Central Bank la transferencia que queremos hacer mediante CBU, el central la redirecciona al banco correspondiente (los primeros 3 numeros del cbu).
    Nosotros intermanete manejamos el descuento de la plata y la acreditacion cuando recibimos una transferencia.
* Modificamos el controlador de transferencias para dar soporte inteligente:
  * **Detector de Alias:** Si el usuario introduce texto en lugar de 22 números, el controlador consulta a la API central para traducir el Alias a CBU.
  * **Sincronización en Segundo Plano (Polling):** Creamos el endpoint `/api/movimientos/sincronizar` que consulta periódicamente los movimientos aprobados en la red externa para impactar saldos locales y registrar ingresos de dinero de terceros de forma permanente.

### 🔹 Fase 4: Autentificado seguro (login).
    *** El banco necesita que nadie pueda ver la informacion de los otros clientes***
* *Login: Para poder manejar el logeo y la creacion de cuentas de una manera segura, implementamos Clerk, que nos facilito esto con una estructura ya armada.
    Para la implementacion, en nuestra base de datos, en la tabla personas, agregamos una nueva columna: clerkId. La cual guarda la informacion del servicio de clerk cuando un cliente se registra se le asigna y cuando se loguea se valida.


### 🔹 Fase 5: Habilitación de Depósitos Locales e Interfaz Avanzada (Actual)
* **Necesidad:** El enunciado requería registrar depósitos en efectivo que no pasan por la red del Central Bank.
* **Backend:** Creamos `Movimiento.registrarDepositoLocal` en el modelo y su respectivo endpoint `POST /api/movimientos/depositar`.
* **Frontend:** Desarrollamos un módulo exclusivo `Depositar.jsx` para simular la carga por terminales de autoservicio y solucionamos el bug de actualización "en vivo" del saldo mediante la reconexión de funciones de refresco (`actualizarDatosBase`) en los procesos de sincronización de fondo.

---

## 📡 Tabla General de Endpoints Disponibles

| Método | Endpoint | Descripción | Componente Frontend |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/movimientos/transferir` | Valida saldo local, resuelve Alias y envía dinero al Central Bank. | `<Transferencias />` |
| `GET` | `/api/movimientos/historial` | Devuelve el historial de transacciones filtrando origen/destino para evitar duplicados. | Vista Inicio e Historial |
| `GET` | `/api/movimientos/sincronizar` | Pollea la red central en busca de transferencias recibidas y actualiza el saldo local. | Background Task (Inicio) |
| `POST` | `/api/movimientos/depositar` | Registra ingresos de efectivo directos en la cuenta del usuario en PostgreSQL. | `<Depositar />` |
| `PUT` | `/api/personas/:cbu/alias` | Modifica el alias del cliente validando que no esté repetido en la base de datos. | Tarjeta de Saldo |