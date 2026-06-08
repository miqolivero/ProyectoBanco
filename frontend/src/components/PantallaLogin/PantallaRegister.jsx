import { SignUp } from "@clerk/clerk-react";
import logo from "../../assets/LogoMinimalista.png";
import fondo from "../../assets/screen.png";
import "./PantallaLogin.css"; // Comparte el mismo CSS exacto

export default function PantallaRegister() {
  return (
    <div className="login-container">

      <div className="login-right-form-col">

        <img src={logo} alt="Logo Calamuchita BANK" className="login-logo-img" />
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
    <h2 style={{ 
      fontSize: '20px', 
      fontWeight: '600', 
      color: '#1a3d2b', 
      margin: '0 0 4px 0',
      fontFamily: "'Segoe UI', sans-serif"
    }}>
      Crea tu cuenta bancaria
    </h2>
    <p style={{ 
      fontSize: '13px', 
      color: '#6b7280', 
      margin: 0,
      fontFamily: "'Segoe UI', sans-serif"
    }}>
      Comienza tu registro en Calamuchita BANK
    </p>
  </div>
        <div className="clerk-form-wrapper">
          <SignUp
            routing="hash"
            signInUrl="/#sign-in" // Redirige al login si ya tienen cuenta
            hideName={true}
            appearance={{
              elements: {
                formResendCodeLink: { color: "#1a5c3a" },
                otherSessionsLink: { color: "#1a5c3a" },
                rootBox: { width: "100%" },
                cardBox: { width: "100%", boxShadow: "none" },
                card: {
                  boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
                  border: "1px solid #e8ede9",
                  borderRadius: "14px",
                  padding: "24px",
                  width: "100%",
                  backgroundColor: "#ffffff",
                },
                headerTitle: { display: "none" },
                headerSubtitle: { display: "none" },
                header: { display: "none" },
                formFieldLabel: { fontSize: "13px", fontWeight: "600", color: "#374151" },
                formFieldInput: {
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  padding: "10px 14px",
                },
                formButtonPrimary: {
                  backgroundColor: "#1a3d2b", // Tu verde pino característico
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  textTransform: "none",
                  padding: "11px",
                  width: "100%",
                },
                footerActionLink: { color: "#1a5c3a", fontWeight: "600" },
                footerPages: { display: "none" },
                backLink: {
                  display: "flex",
                  color: "#1a5c3a",
                  fontWeight: "600",
                  fontSize: "13px",
                },
                backLinkText: {
                  color: "#1a5c3a",
                },
                alternativeMethodsBlockButton: {
                  color: "#1a5c3a",
                  borderColor: "#d1e8d8",
                },
              },
              variables: {
                colorPrimary: "#1a3d2b",
                colorText: "#111827",
                colorTextSecondary: "#6b7280",
                borderRadius: "8px",
                fontFamily: "'Segoe UI', sans-serif",
              },
            }}
          />
        </div>

        <div className="login-footer">
          <p className="login-footer-copy">© 2024 Calamuchita BANK.<br />Miembro de la Red de Bancos Éticos.</p>
          <div className="login-footer-links">
            <a href="#">Privacidad</a>
            <a href="#">Términos</a>
            <a href="#">Seguridad</a>
          </div>
        </div>

      </div>

      <div className="login-left-img-col">
        <img
          src={fondo}
          alt="Sierras de Calamuchita"
          className="login-bg-image"
        />
        <div className="login-floating-text">
          <h2 className="login-floating-title">Bienvenido a Calamuchita BANK</h2>
          <p className="login-floating-desc">
            Donde la solidez financiera se encuentra con la serenidad de nuestra tierra. 
            Comience su viaje hacia una gestión patrimonial consciente y transparente.
          </p>
        </div>
      </div>

    </div>
  );
}