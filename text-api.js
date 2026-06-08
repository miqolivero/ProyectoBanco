const registrarBanco = async () => {
    console.log("🧪 Intentando registro en ambiente de PRUEBAS (test)...");

    try {
        const response = await fetch('https://centralbank.brocoly.cc/api/banks', {
            method: 'POST',
            headers: {
                'x-environment': 'test', // <--- Siempre test para tus pruebas
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 59wWNmrhz0pEs8gKln4SLvudTMoALbDcBDmmdm7R2rw'
            },
            body: JSON.stringify({
                name: "Calamuchita Bank",
                code: "777" // Si te da error de código duplicado, probá con 778, 779...
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log("✅ ¡Banco de PRUEBAS registrado!");
            console.log("Datos de tu banco en test:", data);
            // IMPORTANTE: De acá vas a sacar tu CBU oficial de test
        } else {
            console.log("❌ Error:", response.status);
            console.log("Detalle:", data);
        }
    } catch (error) {
        console.error("Error de conexión:", error.message);
    }
};

registrarBanco();